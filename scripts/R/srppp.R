#' =============================================================================
#'       title:  SRPPP CROP OBJECTS CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-10-02
#' description:  Script to convert crop entity information from the Swiss
#'               registry of plant protection products (SRPPP) to RDF data.
#' =============================================================================

#' Attach libraries to search path
library(rdfhelper)
library(dplyr)
library(xml2)

#' read helper functions
source("scripts/R/helper.R")

#' Constants
languages <- c("de", "fr", "it", "en")

base <- "https://agriculture.ld.admin.ch/crops/"
schema  <- "http://schema.org/"

#' =============================================================================
#' DOWNLOAD THE SWISS PLANT PROTECTION REGISTRY AS AN XML FILE
#' =============================================================================

#' Download and unzip the file
srppp_zip_url <- "https://www.blv.admin.ch/dam/blv/de/dokumente/zulassung-pflanzenschutzmittel/pflanzenschutzmittelverzeichnis/daten-pflanzenschutzmittelverzeichnis.zip.download.zip/Daten%20Pflanzenschutzmittelverzeichnis.zip" # nolint
temp_zip <- tempfile(fileext = ".zip")
unzip_dir <- tempdir()
download.file(srppp_zip_url, temp_zip, mode = "wb")
unzip(temp_zip, exdir = unzip_dir)
data <- file.path(unzip_dir, "PublicationData.xml") |>
  read_xml()

# functions to help deal with lists constructed from XML
get_labels <- function(x) {
  descs <- x[names(x) == "Description"]
  lang <- sapply(descs, attr, "language")
  vals  <- sapply(descs, attr, "value")
  setNames(as.list(vals), lang)
}

# function to get FK from list
get_foreign_keys <- function(x, variable, key = "primaryKey") {
  unname(sapply(x[names(x) == variable], attr, key))
}

# Function to convert *one* crop object to a better processable list
describe <- function(x) {
  code <- attr(x, "primaryKey")
  subject <- rdfhelper::uri(code, base)
  rdfhelper::triple(subject, "a", rdfhelper::uri("CultivationType", base))
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(get_labels(x)[[lang]], lang)
    )
  }
  rdfhelper::triple(
    subject = subject,
    predicate = rdfhelper::uri("partOf", base),
    object = rdfhelper::uri(get_foreign_keys(x, "Parent"), base)
  )
  construct_code(subject, code, "SRPPP") # nolint
}

# Write Turtle file
sink("rdf/srppp.ttl")
catch <- data |>
  xml2::xml_find_all("//MetaData[@name='Culture']/Detail") |>
  xml2::as_list() |>
  lapply(describe)
sink()
