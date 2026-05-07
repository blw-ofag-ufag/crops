import os
import pandas as pd
from rdflib import Graph, URIRef

def extract_dataset_name(g: Graph) -> str:
    """Extracts the dataset schema:name in German to use as the sheet name."""
    query = """
    PREFIX schema: <http://schema.org/>
    PREFIX void: <http://rdfs.org/ns/void#>
    
    SELECT ?name WHERE {
        ?s a void:Dataset .
        ?s schema:name ?name .
        FILTER(lang(?name) = 'de')
    } LIMIT 1
    """
    for row in g.query(query):
        # Excel sheet names are limited to 31 characters
        return str(row.name)[:31]
    return "Unknown_Dataset"

def extract_crops(g: Graph) -> pd.DataFrame:
    """Extracts crop observations and their attributes."""
    query = """
    PREFIX schema: <http://schema.org/>
    PREFIX cube: <https://cube.link/>
    
    SELECT ?crop ?id ?name ?validFrom ?validTo WHERE {
        ?crop a cube:Observation .
        ?crop schema:name ?name .
        FILTER(lang(?name) = 'de')
        
        OPTIONAL { ?crop schema:identifier ?id . }
        OPTIONAL { ?crop schema:validFrom ?validFrom . }
        OPTIONAL { ?crop schema:validTo ?validTo . }
    }
    """
    
    rows = []
    cube_undefined = URIRef("https://cube.link/Undefined")
    
    for row in g.query(query):
        # Handle cube:Undefined gracefully by leaving the field empty
        valid_to = None
        if row.validTo and row.validTo != cube_undefined:
            valid_to = str(row.validTo)
            
        rows.append({
            "Crop URI": str(row.crop),
            "Identifier": str(row.id) if row.id else None,
            "Name (de)": str(row.name),
            "Valid From": str(row.validFrom) if row.validFrom else None,
            "Valid To": valid_to
        })
        
    return pd.DataFrame(rows)

def main():
    input_files = [
        'rdf/data/agis.ttl', 
        'rdf/data/naebi.ttl', 
        'rdf/data/psm.ttl'
    ]
    output_file = 'data/crops.xlsx'
    
    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        for file_path in input_files:
            if not os.path.exists(file_path):
                print(f"Warning: File not found: {file_path}")
                continue
                
            print(f"Processing {file_path}...")
            g = Graph()
            g.parse(file_path, format="turtle")
            
            sheet_name = extract_dataset_name(g)
            
            # Clean sheet name to avoid invalid Excel characters
            safe_sheet_name = sheet_name.replace(':', '-').replace('/', '-')
            
            df = extract_crops(g)
            
            # Write to the respective sheet
            df.to_excel(writer, sheet_name=safe_sheet_name, index=False)
            
    print(f"\nExcel file successfully created at: {output_file}")

if __name__ == "__main__":
    main()