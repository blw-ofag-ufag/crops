# RDF master and reference data about crops

In this project, we propose a unified master data system for crops and crop-related objects.

# Run data integration pipeline

The data integration pipeline uses all the R and python scripts in the `/scripts` folder and can be run with:

```
sh scripts/etl.sh
```

It produces a series of additional turtle/nt files.

# Example queries

You can query the crop master data system using SPARQL.

Here's an [example SPARQL query](https://s.zazuko.com/2SyHoth) that gets you all cultivation type URIs and labels in German:

```sparql
PREFIX schema: <http://schema.org/>
PREFIX : <https://agriculture.ld.admin.ch/crops/>
SELECT *
WHERE {
  ?crop a :CultivationType .
  ?crop schema:name ?name .
  FILTER(LANG(?name)="de")
}
ORDER BY ?name
```