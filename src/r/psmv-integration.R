library(rdfhelper)

# define prefixes
base <- "https://agriculture.ld.admin.ch/crops/"
psm <- "https://agriculture.ld.admin.ch/crops/psm/1/"
rdf <- "http://www.w3.org/1999/02/22-rdf-syntax-ns#"

# download data from infofito export
data <- read.csv("https://raw.githubusercontent.com/BLV-OSAV-USAV/PSMV-RDF/refs/heads/main/data/raw/Code.csv") #nolint
data <- subset(
  data,
  subset = TEXT_KEY == "Culture",
  select = c("ID", "PARENT_ID", "VERSION", "LANGUAGE", "VALUE")
)

# get distinct IDs
distinct <- unique(data$ID)
crops <- data.frame(
  uri = rdfhelper::uri(seq_len(length(distinct)), prefix = psm),
  uuid = distinct
)

# write nt files
sink("rdf/processed/psm.ttl")
for (i in seq_len(nrow(crops))) {
  uri <- crops[i, "uri"]
  id <- crops[i, "uuid"]
  rdfhelper::triple(
    uri,
    rdfhelper::uri("type", rdf),
    rdfhelper::uri("https://cube.link/Observation")
  )

  # Infofito ID
  rdfhelper::triple(
    uri,
    rdfhelper::uri("http://schema.org/identifier"),
    rdfhelper::typed(id, "ID")
  )

  # Infofito concept version
  rdfhelper::triple(
    uri,
    rdfhelper::uri("http://schema.org/version"),
    rdfhelper::typed(data[i, "VERSION"], "integer")
  )

  # labels
  for (lang in c("en", "de", "fr", "it")) {
    value <- subset(
      data,
      subset = ID == id & LANGUAGE == lang,
      select = "VALUE"
    )
    rdfhelper::triple(
      uri,
      rdfhelper::uri("http://schema.org/name"),
      rdfhelper::langstring(as.character(unique(value)), lang)
    )
  }

  # parent relationship
  parents <- unique(subset(data, subset = ID == id, select = "PARENT_ID"))
  parents <- unlist(subset(crops, subset = uuid %in% parents, select = "uri"))
  rdfhelper::triple(
    uri,
    rdfhelper::uri("http://schema.org/isPartOf"),
    parents
  )

  # link from observation set to observations
  rdfhelper::triple(
    rdfhelper::uri("https://cube.link/ObservationSet"),
    rdfhelper::uri("https://cube.link/observation"),
    uri
  )
}
sink()
