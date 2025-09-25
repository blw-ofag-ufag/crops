#' =============================================================================
#'       title:  VARIETY JSON DATA CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-25
#' =============================================================================

#' Fetch  data from GitHub
data <- jsonlite::read_json("https://raw.githubusercontent.com/blw-ofag-ufag/blw-ogd-data/refs/heads/main/data/plant_varieties_in_switzerland.json") # nolint
data <- getElement(data, "varieties")

#' Query country ISO 3166-1 alpha-2 country codes and their LINDAS URI
countries <- rdfhelper::sparql("
PREFIX schema: <http://schema.org/>
SELECT *
FROM <https://lindas.admin.ch/territorial>
WHERE
{
  ?country a schema:Country ;
    schema:alternateName ?code ;
    schema:name ?name .
  FILTER(LANG(?name) = 'en')
}
", "https://lindas.admin.ch/query")

#' Query all plant species from wikidata that have an EPPO code
plants <- rdfhelper::sparql('
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT * WHERE   {
    ?taxon wdt:P171*/wdt:P225 "Plantae" .
	?taxon wdt:P225 ?name .
	?taxon wdt:P3031 ?eppo .
}
', "https://qlever.cs.uni-freiburg.de/api/wikidata")

#' function to clean a scientific name in ProVar
clean_scientific_name <- function(x) {
  name <- x[["botanicalInformation"]][["species"]]
  name <- sub("L.", "", name)
  if (is.null(name)) return(NA)
  strsplit(name, " ") |>
    unlist() |>
    head(2) |>
    paste(collapse = " ")
}

for (i in seq_len(length(data))) {
  name <- clean_scientific_name(data[[i]])
  # eppo <- as.character(plants[plants$name %in% name, "eppo"])
  print(sprintf("%s: %s", name, eppo))
}

sapply(data, clean_scientific_name) |> table() |> sort()