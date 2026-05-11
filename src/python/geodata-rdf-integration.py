import geopandas as gpd
import pandas as pd
import requests
import sys
import os
from io import StringIO
from tqdm import tqdm
from rdflib import Graph, Literal, RDF, URIRef, Namespace
from rdflib.namespace import XSD
from urllib.parse import quote # Added to encode invalid URI characters

# Define paths
INPUT_FILE = "data/LWB_Nutzungsflaechen_Derivat_BGDI_2025.gdb/" 
INPUT_LAYER = "Landwirtschaftliche_Nutzungsflaechen_Schweiz_2025" 
OUTPUT_FILE = "rdf/processed/geodata.ttl"
GRAPH_FILE = "rdf/processed/graph.ttl"
LINDAS_ENDPOINT = "https://lindas.admin.ch/query"

# Configuration for testing
MAX_FEATURES = None  # Set to None to process the entire dataset

# Define namespaces
BASE = Namespace("https://agriculture.ld.admin.ch/crops/")
CULTIVATION = Namespace("https://agriculture.ld.admin.ch/crops/cultivation/")
CTYPE = Namespace("https://agriculture.ld.admin.ch/crops/cultivationtype/")
FARMS = Namespace("https://agriculture.ld.admin.ch/crops/farm/")
PROGRAMS = Namespace("https://agriculture.ld.admin.ch/crops/program/")
GEO = Namespace("http://www.opengis.net/ont/geosparql#")

# Function to fetch canton definitions via SPARQL query from LINDAS
def fetch_cantons():
    query = """
    PREFIX ch: <https://schema.ld.admin.ch/>
    PREFIX schema: <http://schema.org/>
    SELECT * WHERE { ?canton a ch:Canton ; schema:alternateName ?code . }
    """
    try:
        response = requests.get(LINDAS_ENDPOINT, params={'query': query}, headers={'Accept': 'text/csv'})
        response.raise_for_status()
        df = pd.read_csv(StringIO(response.text))
        return dict(zip(df['code'], df['canton']))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    # Fetch canton definitions from LINDAS
    canton_map = fetch_cantons()

    # Read geopackage/geodatabase data
    print("Reading GDB...")
    gdf = gpd.read_file(INPUT_FILE, layer=INPUT_LAYER)
    
    # Limit observations if MAX_FEATURES is set
    if MAX_FEATURES is not None:
        print(f"Limiting execution to the first {MAX_FEATURES} records for testing...")
        gdf = gdf.head(MAX_FEATURES)
    
    # Transform Coordinate Reference System from Swiss LV95 to WGS84
    print("Transforming CRS to EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)

    # Initialize graph
    g = Graph()
    
    # Bind prefixes
    g.bind("", BASE)
    g.bind("cultivation", CULTIVATION)
    g.bind("cultivationtype", CTYPE)
    g.bind("farm", FARMS)
    g.bind("program", PROGRAMS)
    g.bind("geo", GEO)
    g.bind("rdf", RDF)
    g.bind("xsd", XSD)

    print("Generating Triples...")
        
    # Integer properties: { 'RDF_Property_Name': 'DataFrame_Column' }
    int_props = {
        'area': 'flaeche_m2',
        'trees': 'anzahl_baeume',
        'managementDegree': 'bewirtschaftungsgrad'
    }

    # gYear properties: { 'RDF_Property_Name': 'DataFrame_Column' }
    year_props = {
        'year': 'bezugsjahr',
        'commitmentStartYear': 'verpflichtung_von',
        'commitmentEndYear': 'verpflichtung_bis'
    }

    # Boolean properties: { 'RDF_Property_Name': 'DataFrame_Column' }
    bool_props = {
        'overlapping': 'ist_ueberlagernd',
        'eligibleForFunding': 'beitragsberechtigt',
        'activeInFundingYear': 'nutzung_im_beitragsjahr',
        'protectedUnderNHG': 'nhg',
        'isDefinitive': 'ist_definitiv'
    }

    # Iterate over rows
    for row in tqdm(gdf.itertuples(), total=len(gdf)):
        
        # Subject definition
        # Using quote() here as well, just in case t_id ever changes format
        subject_id = quote(str(row.t_id))
        subject = CULTIVATION[subject_id]
        
        # Class assignment
        if pd.notna(getattr(row, 'lnf_code', None)):
            g.add((subject, RDF.type, CTYPE[str(row.lnf_code)]))
        
        # Geometry
        g.add((subject, GEO.asWKT, Literal(row.geometry.wkt, datatype=GEO.wktLiteral)))

        # Process Integer properties Loop
        for prop_name, col_name in int_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                g.add((subject, BASE[prop_name], Literal(int(val), datatype=XSD.integer)))

        # Process Year properties loop
        for prop_name, col_name in year_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                if hasattr(val, 'year'):
                    year_val = val.year
                else:
                    year_val = int(val)
                g.add((subject, BASE[prop_name], Literal(str(year_val), datatype=XSD.gYear)))

        # Process Boolean properties loop
        for prop_name, col_name in bool_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                g.add((subject, BASE[prop_name], Literal(bool(val), datatype=XSD.boolean)))

        # Mowing date
        schnitt = getattr(row, 'schnittzeitpunkt', None)
        if pd.notna(schnitt):
            g.add((subject, BASE.mowingDate, Literal(schnitt, datatype=XSD.date)))
        
        # Programs (1:n relationship)
        code_prog = getattr(row, 'code_programm', None)
        if pd.notna(code_prog):
            programs = str(code_prog).split(';')
            for prog_code in programs:
                prog_code = prog_code.strip()
                if prog_code and prog_code != "Non":
                    # URL-encode the program code to prevent URI errors
                    safe_prog_code = quote(prog_code)
                    g.add((subject, BASE.program, PROGRAMS[safe_prog_code]))

        # Management unit
        farm_id = getattr(row, 'betriebsnummer', None)
        if pd.notna(farm_id):
            # URL-encode the farm ID to handle spaces and slashes (e.g., "AG4001/ 1/112" -> "AG4001/%201/112")
            safe_farm_id = quote(str(farm_id))
            farm_uri = FARMS[safe_farm_id]
            g.add((subject, BASE.managementUnit, farm_uri))
            g.add((farm_uri, RDF.type, BASE.ManagementUnit)) 

        # Canton
        kanton = getattr(row, 'kanton', None)
        if pd.notna(kanton) and kanton in canton_map:
            g.add((subject, BASE.canton, URIRef(canton_map[kanton])))

    # Merge geodata with ontology graph
    if os.path.exists(GRAPH_FILE):
        print(f"Merging generated triples with {GRAPH_FILE}...")
        g.parse(GRAPH_FILE, format="turtle")
    else:
        print(f"Warning: {GRAPH_FILE} not found. Skipping merge and serializing only generated triples.")

    print(f"Serializing to {OUTPUT_FILE}...")
    g.serialize(destination=OUTPUT_FILE, format="turtle")
    print(f"Done! Output written to disk as {OUTPUT_FILE}")

if __name__ == "__main__":
    main()