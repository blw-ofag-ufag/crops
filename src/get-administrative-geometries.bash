#!/bin/bash

# Ensure output directory exists
mkdir -p rdf/processed
OUTPUT_FILE="rdf/processed/areas.ttl"

# Clear previous output if it exists
> "$OUTPUT_FILE"

echo "1. Fetching geometry URIs..."
curl --http1.1 -s -X POST \
     -H "Accept: text/csv" \
     -H "Accept-Encoding: gzip" --compressed \
     --data-urlencode "query@src/sparql/queries/get-geometry-uris.rq" \
     https://geo.ld.admin.ch/query \
     -o uris.csv

echo "2. Iterating over URIs to fetch WKT strings..."
# tail -n +2 skips the CSV header line. tr commands clean up carriage returns and quotes.
tail -n +2 uris.csv | tr -d '\r' | tr -d '"' | while read -r uri; do
  
  # Skip empty lines
  if [ -z "$uri" ]; then continue; fi

  echo "Fetching WKT for: $uri"

  # Construct a targeted query for exactly this URI
  TARGETED_QUERY="PREFIX geo: <http://www.opengis.net/ont/geosparql#>
  CONSTRUCT { <$uri> geo:asWKT ?wkt . }
  WHERE { <$uri> geo:asWKT ?wkt . }"

  # Fetch and append to the final Turtle file
  curl --http1.1 -s -X POST \
       -H "Accept: text/turtle" \
       --data-urlencode "query=$TARGETED_QUERY" \
       https://geo.ld.admin.ch/query \
       >> "$OUTPUT_FILE"

  # Add a small delay to be polite to the server and prevent rate limiting
  sleep 0.1
done

echo "Done! Data safely stored in $OUTPUT_FILE"