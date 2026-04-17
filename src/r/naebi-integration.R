library(rdfhelper)
library(jsonlite)
library(dplyr)
library(tidyr)

source("src/r/helper.R")


# variables and load data
PREFIXES <- read_prefixes_ttl("rdf/ontology/prefixes.ttl")
endpoint <- "https://rf-vp.agate.ch/digiflux/naebi/2-0/naebiservice-backend/agronomiccropcategories"
naebi <- "https://agriculture.ld.admin.ch/crops/naebi/1"

# get json from NAEBI API
crop_data <- fromJSON(endpoint)

# get distinct NAEBI IDs
distinct <- unique(crop_data$code)

# transform json to df
crops <- data.frame(
  uri = rdfhelper::uri(seq_len(length(distinct)), prefix = naebi),
  uuid = distinct
)

# generate .ttl file

sink("test.ttl")
write_global_prefixes(PREFIXES)

for (i in seq_len(nrow(crops))) {
  uri <- crops[i, "uri"]
  id <- crops[i, "uuid"]


  rdfhelper::triple(
    uri,
    qname(PREFIXES, "rdf", "type"),
    qname(PREFIXES, "cube", "Observation")
  )

  # generate schema:name (only @de atm, because there are no other names in NAEBI)
  de_name <- crop_data$descriptor$designation_deu[i]
  rdfhelper::triple(
    uri,
    qname(PREFIXES, "schema", "name"),
    rdfhelper::langstring(de_name, "de")
  )

  rdfhelper::triple(
    uri,
    qname(PREFIXES, "schema", "identifier"),
    rdfhelper::typed(id, "ID")
  )


  # get nutrient requirements from nested df
  req_df <- crop_data$requirement[[i]]

  if (is.data.frame(req_df) && nrow(req_df) > 0) {
    for (j in seq_len(nrow(req_df))) {

      formula <- req_df[j, "molecularFormula"]
      qty     <- req_df[j, "quantity"]

      if (!is.na(formula) && !is.na(qty)) {
        rdfhelper::triple(
          uri,
          qname(PREFIXES, "base", formula),
          rdfhelper::typed(qty, "decimal")
        )
      }
    }
  }

  # add observationset
  obs_set_uri <- qname(PREFIXES, "naebi", "ObservationSet")

  # declare that this instance is a cube:ObservationSet
  rdfhelper::triple(
    obs_set_uri,
    qname(PREFIXES, "rdf", "type"),
    qname(PREFIXES, "cube", "ObservationSet")
  )

  # 3. link all URIs to set
  for (obs_uri in crops$uri) {
    rdfhelper::triple(
      obs_set_uri,
      qname(PREFIXES, "cube", "observation"),
      obs_uri
    )
  }

}

sink()

