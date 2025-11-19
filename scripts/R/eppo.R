#' =============================================================================
#'       title:  EPPO HIERARCHY DATA INTEGRATION
#'      author:  Damian Oswald
#'        date:  2025-11-19
#' =============================================================================

#' Attach libraries to search path
library(dotenv)
library(rdfhelper)

#' Load API keys
dotenv::load_dot_env(file = ".env")

#' Variables for API path constructions
token <- paste0("?authtoken=", Sys.getenv("EPPO"))
base <- "https://data.eppo.int/api/rest/1.0/taxon"

#' Function to run a get request of a specific resource type
eppo_get <- function(base, code, type, token) {
  url <- paste0(file.path(base, code, type), token)
  gsub("\\/\\?", "?", url) |>
    jsonlite::read_json()
}

#' Should we ingest all data (TRUE) or just the missing one (FALSE)?
all <- FALSE

#' Run SPARQL query on LINDAS
results <- rdfhelper::sparql('
  PREFIX : <https://agriculture.ld.admin.ch/crops/>
  SELECT ?eppo (COUNT(DISTINCT ?object) AS ?attributes)
  FROM <https://lindas.admin.ch/foag/crops>
  WHERE {
    {
      ?crop ?something ?object .
      ?cultivationtype ?predicate ?crop .
    }
    UNION
    {
      ?subject ?something ?crop .
      ?cultivationtype ?predicate ?crop .
    }
    FILTER STRSTARTS(STR(?crop), "https://agriculture.ld.admin.ch/crops/taxon/")
    BIND(REPLACE(STR(?crop), "^.*/([^/]*)$", "$1") AS ?eppo)
    OPTIONAL { ?crop ?pedicate ?object . }
  }
  GROUP BY ?eppo
  ORDER BY ASC(?attributes)
', endpoint = "https://agriculture.ld.admin.ch/query")

#' Read EPPO codes from results
if (all) {
  codes <- results$eppo
} else {
  codes <- subset(results, select = eppo, subset = attributes <= 3) |> unlist()
}

crops <- "https://agriculture.ld.admin.ch/crops/"
taxon <- "https://agriculture.ld.admin.ch/crops/taxon/"
schema <- "http://schema.org/"

ranks <- rdfhelper::uri(c(
  "Kingdom",
  "Phylum",
  "Class",
  "Category",
  "Order",
  "Family",
  "Subfamily",
  "Genus",
  "Species"
), prefix = crops)

sink("rdf/taxa.ttl", append = TRUE)

#' Run conversion for each code in the retreived data frame individually
for (code in codes) {

  #' save subject IRI
  subject <- rdfhelper::uri(code, taxon)

  #' declare class
  rdfhelper::triple(subject, "a", uri("CropTaxon", crops))

  #' get base information
  info <- eppo_get(base, code, "", token)

  #' fetch names from EPPO API
  names <- eppo_get(base, code, "names", token)
  rdfhelper::triple(
    subject,
    rdfhelper::uri("taxonName", crops),
    rdfhelper::literal(info$prefname)
  )

  #' write names in different languages
  for (i in names) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri(
        ifelse(i$preferred == 1, "name", "alternateName"),
        schema
      ),
      object = rdfhelper::langstring(i$fullname, i$isolang)
    )
  }

  #' get parent taxon
  parents <- eppo_get(base, code, "taxonomy", token)

  #' write taxonomic data
  for (i in seq_along(parents)) {

    #' save subject IRI
    subject <- rdfhelper::uri(parents[[i]]$eppocode, taxon)

    #' save rank of the taxon
    rank <- parents[[i]][["level"]]

    #' declare class
    rdfhelper::triple(subject, "a", uri("CropTaxon", crops))

    #' write taxon rank
    rdfhelper::triple(subject, rdfhelper::uri("taxonRank", crops), ranks[rank])

    #' write parent taxon information
    if (i < length(parents)) {
      child <- rdfhelper::uri(parents[[i + 1]]$eppocode, taxon)
      rdfhelper::triple(child, rdfhelper::uri("parentTaxon", crops), subject)
    }

  }

  #' save EPPO code/URL
  triple(
    subject,
    rdfhelper::uri("eppo", crops),
    rdfhelper::uri(file.path("https://gd.eppo.int/taxon", code))
  )

}

sink()
