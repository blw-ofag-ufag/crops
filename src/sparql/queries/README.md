## Download administrative units

``` bash
curl -X POST \
     -H "Accept: text/turtle" \
     --data-urlencode "query@src/sparql/queries/get-administrative-units.rq" \
     https://geo.ld.admin.ch/query \
     -o rdf/processed/admin.ttl

python src/python/rdf-processing.py \
  --input rdf/ontology/prefixes.ttl rdf/processed/admin.ttl \
  --output rdf/processed/admin.ttl
```

## Download administrative areas

Since the WKT literals are very large strings, we need some encoding.

``` bash
curl --http1.1 -X POST \
     -H "Accept: text/turtle" \
     -H "Accept-Encoding: gzip" --compressed \
     --data-urlencode "query@src/sparql/queries/get-administrative-areas.rq" \
     https://geo.ld.admin.ch/query \
     -o rdf/processed/areas.ttl

python src/python/rdf-processing.py \
  --input rdf/ontology/prefixes.ttl rdf/processed/areas.ttl \
  --output rdf/processed/areas.ttl
```