import geopandas as gpd
import pandas as pd
import requests
import sys
import os
from io import StringIO
from tqdm import tqdm
from rdflib import Graph, Literal, RDF, URIRef, Namespace
from rdflib.namespace import XSD

# Define paths
INPUT_FILE = "data/data.gpkg"
INPUT_LAYER = "nutzungsflaechen"
OUTPUT_FILE = "rdf/geodata.ttl"
LINDAS_ENDPOINT = "https://lindas.admin.ch/query"

# Create the output directory, if necessary
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

# Define namespaces
BASE = Namespace("https://agriculture.ld.admin.ch/crops/")
GEO = Namespace("http://www.opengis.net/ont/geosparql#")
SCHEMA = Namespace("http://schema.org/")
CULTIVATION = Namespace(BASE + "cultivation/")
CTYPE = Namespace(BASE + "cultivationtype/")
FARMS = Namespace(BASE + "farm/")
PROGRAMS = Namespace(BASE + "program/")

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

# Function to transform the geopackage data to RDF
def main():

    # Fetch canton definitions from LINDAS
    canton_map = fetch_cantons()

    # Read geopackage data
    print("Reading GPKG...")
    gdf = gpd.read_file(INPUT_FILE, layer=INPUT_LAYER)
    
    # Transform Coordinate Reference System from Swiss LV95 to WGS84
    gdf = gdf.to_crs(epsg=4326)

    # Initialize graph
    g = Graph()
    
    # Bind prefixes
    g.bind("base", BASE)
    g.bind("geo", GEO)
    g.bind("cultivation", CULTIVATION)
    g.bind("ctype", CTYPE)
    g.bind("farm", FARMS)
    g.bind("program", PROGRAMS)

    print("Generating Triples...")
        
    # Integer properties: { 'RDF_Property_Name': 'DataFrame_Column' }
    int_props = {
        'area': 'flaeche_m2',
        'trees': 'anzahl_baeume',
        'managementDegree': 'bewirtschaftungsgrad' # Renamed from German
    }

    # gYear properties: { 'RDF_Property_Name': 'DataFrame_Column' }
    year_props = {
        'year': 'bezugsjahr',
        'commitmentStartYear': 'verpflichtung_von', # Renamed
        'commitmentEndYear': 'verpflichtung_bis'    # Renamed
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
        subject = CULTIVATION[str(row.t_id)]
        
        # Class assignment
        g.add((subject, RDF.type, CTYPE[str(row.lnf_code)]))
        
        # Geometry
        g.add((subject, GEO.asWKT, Literal(row.geometry.wkt, datatype=GEO.wktLiteral)))

        # Process Integer properties Loop
        for prop_name, col_name in int_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                g.add((subject, BASE[prop_name], Literal(int(val), datatype=XSD.integer)))

        # Process Year properties loop (converts to int then str for XSD.gYear)
        for prop_name, col_name in year_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                g.add((subject, BASE[prop_name], Literal(str(int(val)), datatype=XSD.gYear)))

        # Process Boolean properties loop
        for prop_name, col_name in bool_props.items():
            val = getattr(row, col_name, None)
            if pd.notna(val):
                g.add((subject, BASE[prop_name], Literal(bool(val), datatype=XSD.boolean)))

        # Mowing date
        if pd.notna(row.schnittzeitpunkt):
            g.add((subject, BASE.mowingDate, Literal(row.schnittzeitpunkt, datatype=XSD.date)))
        
        # Programs (1:n relationship)
        if pd.notna(row.code_programm):
            programs = str(row.code_programm).split(';')
            for prog_code in programs:
                prog_code = prog_code.strip()
                if prog_code and prog_code != "Non":
                    g.add((subject, BASE.program, PROGRAMS[prog_code]))

        # Management unit (Farm ID)
        if pd.notna(row.identifikator_be):
            farm_uri = FARMS[str(row.identifikator_be)]
            g.add((subject, BASE.managementUnit, farm_uri))
            g.add((farm_uri, RDF.type, BASE.ManagementUnit)) 

        # Canton
        if pd.notna(row.kanton) and row.kanton in canton_map:
            g.add((subject, BASE.canton, URIRef(canton_map[row.kanton])))

    g.serialize(destination=OUTPUT_FILE, format="turtle")
    print(f"Done! Output written to disk as {OUTPUT_FILE}")

if __name__ == "__main__":
    main()