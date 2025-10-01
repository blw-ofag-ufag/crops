#!/bin/bash

# Load environment variables from .env file
source .env

# Run R processing steps
for r in agis grud provar; do
  Rscript "scripts/${r}.R"
done

# Process RDF files using Python scrips
python3 scripts/reason.py rdf/ontology.ttl rdf/agis.ttl rdf/srppp.ttl rdf/grud.ttl rdf/provar.ttl

# Delete existing data from LINDAS
curl \
  --user $USER:$PASSWORD \
  -X DELETE \
  "$ENDPOINT?graph=$GRAPH"

# Upload graph.ttl to LINDAS 
curl \
  --user $USER:$PASSWORD \
  -X POST \
  -H "Content-Type: text/turtle" \
  --data-binary @rdf/graph.ttl \
  "$ENDPOINT?graph=$GRAPH"
