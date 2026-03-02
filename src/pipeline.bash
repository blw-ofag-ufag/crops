#!/bin/bash
set -e # immediately exit on error
source .env


echo "Validate syntax of turtle files"
python src/python/validate.py rdf


echo "Create a dedicated ontology file for subsequent WebVOWL visualization"
python src/python/rdf-processing.py \
  --input rdf/ontology/*.ttl \
  --output rdf/processed/ontology.ttl \
  --rules src/sparql/inference-rules/*.sparql src/sparql/processing-rules/*.sparql


echo "Merge all data into one graph for subsequent LINDAS upload"
python src/python/rdf-processing.py \
  --input rdf/ontology/*.ttl \
  --output rdf/processed/graph.ttl \
  --rules src/sparql/inference-rules/*.sparql


echo "Delete existing data from LINDAS"
curl \
  --user $USER:$PASSWORD \
  -X DELETE \
  "$ENDPOINT?graph=$GRAPH"


echo "Upload graph.ttl file to LINDAS"
curl \
  --user $USER:$PASSWORD \
  -X POST \
  -H "Content-Type: text/turtle" \
  --data-binary @rdf/processed/graph.ttl \
  "$ENDPOINT?graph=$GRAPH"
