import pandas as pd
from rdflib import Graph, Namespace, Literal, URIRef, RDF, XSD

def build_agis_rdf_graph(input_file: str, output_file: str):
    """
    Parses the AGIS crop master data and serializes it to an RDF Turtle format
    using rdflib, conforming to the cube.link specifications.
    """
    
    # 1. Load and transform the data
    df = pd.read_excel(input_file, sheet_name=2, na_values="NA")

    category_map = {
        "Ackerfläche": "1",
        "Dauergrünfläche": "21",
        "Flächen ausserhalb der landwirtschaftlichen Nutzfläche": "12",
        "Weitere Flächen innerhalb der landwirtschaftlichen Nutzfläche": "10",
        "Flächen im Sömmerungsgebiet": "13",
        "Flächen mit Kulturen in ganzjährig geschütztem Anbau": "7",
        "Andere Elemente": "20",
        "Flächen mit Dauerkulturen": pd.NA
    }
    df['CULTIVATIONTYPECATEGORY'] = df['CULTIVATIONTYPECATEGORY_DE'].map(category_map)

    # Type normalization and orthographic sanitization
    df['VALID_FROM_YEAR'] = pd.to_datetime(df['VALID_FROM']).dt.year.astype('Int64')
    df['VALID_TO_YEAR'] = pd.to_datetime(df['VALID_TO']).dt.year.astype('Int64')
    
    df['NAME_DE'] = df['NAME_DE'].fillna('').astype(str).str.replace('ß', 'ss')
    df['NAME_FR'] = df['NAME_FR'].fillna('').astype(str)
    df['NAME_IT'] = df['NAME_IT'].fillna('').astype(str)

    # 2. Initialize the Graph and Namespaces
    g = Graph()
    
    BASE = Namespace("https://agriculture.ld.admin.ch/crops/")
    AGIS = Namespace("https://agriculture.ld.admin.ch/crops/agis/1.6/")
    CULT_TYPE = Namespace("https://agriculture.ld.admin.ch/crops/cultivationtype/")
    CUBE = Namespace("https://cube.link/")
    SCHEMA = Namespace("http://schema.org/") 
    
    # Bind prefixes for serialization
    g.bind("", BASE)
    g.bind("agis", AGIS)
    g.bind("cultivationtype", CULT_TYPE)
    g.bind("cube", CUBE)
    
    # Force the override of the default 'schema' prefix assignment
    g.bind("schema", SCHEMA, override=True, replace=True)

    # 3. Construct the Graph
    obs_set = AGIS.ObservationSet
    g.add((obs_set, RDF.type, CUBE.ObservationSet))

    for _, row in df.iterrows():
        raw_dp_crop = row['DIRECTPAYMENTCROP']
        
        # 1. Skip structural nulls
        if pd.isna(raw_dp_crop):
            continue
            
        # 2. Sanitize the identifier (strips trailing/leading whitespace and invisible characters)
        dp_crop = str(raw_dp_crop).strip()
        
        # 3. Guard against empty strings after stripping or pandas "nan" strings
        if not dp_crop or dp_crop.lower() == 'nan':
            continue
        
        obs_node = AGIS[dp_crop]
        
        # Link Observation to ObservationSet
        g.add((obs_set, CUBE.observation, obs_node))
        
        # Define Observation properties
        g.add((obs_node, RDF.type, CUBE.Observation))
        g.add((obs_node, SCHEMA.identifier, Literal(dp_crop, datatype=XSD.ID)))
        
        # Append multilingual names
        if row['NAME_DE']:
            g.add((obs_node, SCHEMA.name, Literal(row['NAME_DE'], lang="de")))
        if row['NAME_FR']:
            g.add((obs_node, SCHEMA.name, Literal(row['NAME_FR'], lang="fr")))
        if row['NAME_IT']:
            g.add((obs_node, SCHEMA.name, Literal(row['NAME_IT'], lang="it")))
            
        # Handle temporal boundaries
        if pd.notna(row['VALID_FROM_YEAR']):
            g.add((obs_node, SCHEMA.validFrom, Literal(str(row['VALID_FROM_YEAR']), datatype=XSD.gYear)))
        else:
            g.add((obs_node, SCHEMA.validFrom, CUBE.Undefined))

        if pd.notna(row['VALID_TO_YEAR']):
            g.add((obs_node, SCHEMA.validTo, Literal(str(row['VALID_TO_YEAR']), datatype=XSD.gYear)))
        else:
            g.add((obs_node, SCHEMA.validTo, CUBE.Undefined))
            
        # Handle cultivation classes with the same strict whitespace stripping
        cult_group = row['CULTIVATIONTYPECATEGORY']
        if pd.notna(cult_group):
            clean_cult_group = str(cult_group).strip()
            if clean_cult_group and clean_cult_group.lower() != 'nan':
                g.add((obs_node, BASE.cultivationGroup, CULT_TYPE[clean_cult_group]))
            
        g.add((obs_node, BASE.cultivationType, CULT_TYPE[dp_crop]))

    # 4. Serialize
    g.serialize(destination=output_file, format="turtle", encoding="utf-8")

if __name__ == "__main__":
    build_agis_rdf_graph("data/agis-crops.xlsx", "rdf/processed/agis.ttl")