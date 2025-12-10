import geopandas as gpd
import pandas as pd
import requests
import sys
import os
from io import StringIO
from tqdm import tqdm

# ==============================================================================
# CONFIGURATION
# ==============================================================================

INPUT_FILE = "data/data.gpkg"
INPUT_LAYER = "nutzungsflaechen"
OUTPUT_FILE = "rdf/geodata.ttl"
LINDAS_ENDPOINT = "https://lindas.admin.ch/query"

# Prefixes
BASE = "https://agriculture.ld.admin.ch/crops/"
CULTIVATION = BASE + "cultivation/"
CULTIVATION_TYPE = BASE + "cultivationtype/"
FARMS = BASE + "farm/"
GEOSPARQL = "http://www.opengis.net/ont/geosparql#"
WKT_LITERAL = "http://www.opengis.net/ont/geosparql#wktLiteral"
XSD_DATE = "http://www.w3.org/2001/XMLSchema#date"

# Ensure output directory exists
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

def fetch_cantons():
    """Fetches canton definitions via SPARQL (CSV) and returns a dict."""
    print("Fetching canton data...")
    query = """
    PREFIX ch: <https://schema.ld.admin.ch/>
    PREFIX schema: <http://schema.org/>
    SELECT * WHERE { ?canton a ch:Canton ; schema:alternateName ?code . }
    """
    try:
        headers = {'Accept': 'text/csv'}
        response = requests.get(LINDAS_ENDPOINT, params={'query': query}, headers=headers)
        response.raise_for_status()
        df = pd.read_csv(StringIO(response.text))
        return dict(zip(df['code'], df['canton']))
    except Exception as e:
        print(f"Error fetching SPARQL: {e}", file=sys.stderr)
        sys.exit(1)

def build_triple_batch(subjects, predicate_uri, values, is_uri=False, literal_type=None, uri_prefix=""):
    """
    Vectorized triple generator that automatically drops missing (NaN/None) values.
    Returns a pandas Series of formatted strings: "<s> <p> <o> ."
    """
    # 1. Create a mask for valid data (not null/NaN)
    mask = values.notna()
    
    # If no data is valid, return empty
    if not mask.any():
        return pd.Series([], dtype=object)

    # 2. Filter both subjects and values using the mask
    #    This aligns the subject with its valid value, skipping missing rows.
    valid_subs = subjects[mask]
    valid_vals = values[mask]

    # 3. Format the Object part
    if is_uri:
        # e.g. <https://.../code>
        obj_str = "<" + uri_prefix + valid_vals.astype(str) + ">"
    else:
        # e.g. "123" or "123"^^<datatype>
        obj_str = '"' + valid_vals.astype(str) + '"'
        if literal_type:
            obj_str += "^^<" + literal_type + ">"

    # 4. Concatenate: <s> <p> <o> .
    return valid_subs + f" <{predicate_uri}> " + obj_str + " ."

def main():
    canton_map = fetch_cantons()

    print("Reading GPKG...")
    gdf = gpd.read_file(INPUT_FILE, layer=INPUT_LAYER)
    gdf = gdf.to_crs(epsg=4326)

    print(f"Processing {len(gdf)} rows...")
    
    # Pre-calculate Subject URIs for all rows
    # We do this once. The helper function will slice this array as needed.
    subject_uris = "<" + CULTIVATION + gdf['t_id'].astype(str) + ">"

    # --- GENERATE BLOCKS ---
    # We store valid triples in a list of Series. 
    # This keeps memory usage lower than one giant string and is faster than a loop.
    
    blocks = []

    print("Generating Triples...")

    # 1. rdf:type (Assume all rows exist)
    blocks.append(
        subject_uris + " <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <" + BASE + "Cultivation> ."
    )

    # 2. Cultivation Type (URI)
    blocks.append(build_triple_batch(
        subject_uris, BASE + "cultivationtype", gdf['lnf_code'], 
        is_uri=True, uri_prefix=CULTIVATION_TYPE
    ))

    # 3. Geometry (Literal - WKT)
    # GeoPandas geometries are rarely NaN, but we check anyway
    blocks.append(build_triple_batch(
        subject_uris, GEOSPARQL + "asWKT", gdf.geometry.to_wkt(), 
        is_uri=False, literal_type=WKT_LITERAL
    ))

    # 4. Area (Literal)
    blocks.append(build_triple_batch(
        subject_uris, BASE + "area", gdf['flaeche_m2']
    ))

    # 5. Trees (Literal) - This will now properly skip rows where anzahl_baeume is NaN
    blocks.append(build_triple_batch(
        subject_uris, BASE + "trees", gdf['anzahl_baeume']
    ))

    # 6. Management Unit (URI)
    blocks.append(build_triple_batch(
        subject_uris, BASE + "managementUnit", gdf['identifikator_be'], 
        is_uri=True, uri_prefix=FARMS
    ))

    # 7. Canton (URI) - using map
    # We map first. Any code not in the map becomes NaN, which build_triple_batch handles.
    mapped_cantons = gdf['kanton'].map(canton_map)
    blocks.append(build_triple_batch(
        subject_uris, BASE + "canton", mapped_cantons, 
        is_uri=True, uri_prefix="" # Prefix is empty because map returns full URI
    ))

    # 8. Mowing Date (Literal - Date)
    blocks.append(build_triple_batch(
        subject_uris, BASE + "movingDate", gdf['schnittzeitpunkt'], 
        is_uri=False, literal_type=XSD_DATE
    ))

    # --- WRITE TO DISK ---
    print("Writing to disk...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        # Write Main Data
        for block in tqdm(blocks, desc="Writing attributes"):
            # block is a pandas Series of strings
            # We iterate the series to write lines.
            # (f.writelines with a generator is usually optimal here)
            f.writelines(line + "\n" for line in block)

        # Write Unique Management Units (Farms)
        print("Processing unique farms...")
        unique_farms = gdf['identifikator_be'].dropna().unique()
        farm_lines = (
            f"<{FARMS}{farm_id}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <{BASE}ManagementUnit> .\n"
            for farm_id in unique_farms
        )
        f.writelines(farm_lines)

    print(f"Done! Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
