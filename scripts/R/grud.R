#' =============================================================================
#'       title:  GRUD CROP DATA CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-22
#' =============================================================================

#' Attach libraries to search path
library(rdfhelper)
library(dplyr)
library(jsonlite)

#' read helper functions
source("scripts/R/helper.R")

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
  construct_code(subject, getElement(object, "code"), "NAEBI") # nolint
  construct_code(subject, getElement(object, "oldKey"), "GRUD") # nolint
}

sink("rdf/grud.ttl")
for (i in seq_len(length(data))) {
  subject <- rdfhelper::uri(i + 200, base)
  process(data[[i]], subject)
}
sink()
