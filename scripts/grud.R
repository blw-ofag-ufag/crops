#' =============================================================================
#'       title:  GRUD CROP DATA CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-22
#' =============================================================================

#' Attach libraries to search path
library(rdfhelper)
library(dplyr)
library(jsonlite)


#' Constants
languages <- c(
  de = "designation_deu"
)
endpoint <- "https://rf-vp.agate.ch/digiflux/naebi/naebiservice-backend/"


#' =============================================================================
#' PREFIX DEFINITION
#' =============================================================================

base <- "https://agriculture.ld.admin.ch/crops/"
schema  <- "http://schema.org/"


#' =============================================================================
#' DOWNLOAD DATA
#' =============================================================================

data <- jsonlite::read_json(file.path(endpoint, "agronomiccropcategories"))

process <- function(object, subject) {

  rdfhelper::triple(subject, "a", rdfhelper::uri("GRUDCrop", base))

  for (i in seq_along(languages)) {

    rdfhelper::triple(
      subject,
      rdfhelper::uri("name", schema),
      langstring(
        object[["descriptor"]][[languages[i]]],
        names(languages)[i]
      )
    )
  }

  code <- getElement(object, "code")
  bnode <- paste0("_:", rlang::hash(code))
  rdfhelper::triple(subject, rdfhelper::uri("identifier", schema), bnode)
  rdfhelper::triple(bnode, rdfhelper::uri("value", schema), literal(code))
  rdfhelper::triple(bnode, rdfhelper::uri("name", schema), literal("GRUD"))
}

sink("rdf/grud.ttl")
for (i in seq_len(length(data))) {
  subject <- rdfhelper::uri(i + 200, base)
  process(data[[i]], subject)
}
sink()
