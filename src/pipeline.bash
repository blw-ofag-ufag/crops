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
