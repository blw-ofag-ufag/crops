#' =============================================================================
#'       title:  AGIS CROP TABLE CONVERSION TO RDF
#'      author:  Damian Oswald
#'        date:  2025-09-18
#' description:  Script to convert an Excel table of AGIS masterdata to RDF for
#'               subsequent publication on LINDAS and integration with other
#'               crop data.
#' =============================================================================

#' Attach libraries to search path
library(rdfhelper)
library(dplyr)

#' read helper functions
source("scripts/R/helper.R")

#' Constants
languages <- c("de", "fr", "it")

#' =============================================================================
#' DOWNLOAD DATA
#' =============================================================================

base_url <- "https://www.blw.admin.ch/dam/de/sd-web/bkAU6T83hyLT"
filename <- "LWB_Nutzungsfl%C3%A4chen_Kataloge.xlsx"
destfile <- tempfile(fileext = ".xlsx")
download.file(file.path(base_url, filename), destfile, mode = "wb")
data <- readxl::read_excel("data/agis-crops.xlsx", sheet = 3, na = "NA")

#' =============================================================================
#' PREFIX DEFINITION
#' =============================================================================

base <- "https://agriculture.ld.admin.ch/crops/"
cultivationtype <- paste0(base, "cultivationtype/")
schema  <- "http://schema.org/"

#' Create a new crops turtle file
sink("rdf/agis.ttl")

#' =============================================================================
#' WRITE CROP CATEGORIES
#' =============================================================================

colnames <- paste("CULTIVATIONTYPECATEGORY", toupper(languages), sep = "_")
categories <- data %>%
  filter(if_all(all_of(colnames), ~ .x != "NULL")) %>%
  subset(select = colnames) %>%
  unique()
categories$code <- NA
categories$uri <- NA

for (i in seq_len(nrow(categories))) {

  # save a made up ID/IRI for this object
  code <- i
  categories[i, "code"] <- code
  subject <- rdfhelper::uri(code, prefix = cultivationtype)
  categories[i, "uri"] <- subject

  # Static class assignment
  rdfhelper::triple(
    subject,
    "a",
    uri(c("CultivationType"), base)
  )

  # Dynamic class assignment
  construct_class_membership(
    subject,
    uri("CultivationTypeCategory", base),
    name = "AGIS"
  )

  # Labelling
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = categories[
          i,
          paste("CULTIVATIONTYPECATEGORY", toupper(lang), sep = "_")
        ],
        lang = lang
      )
    )
  }
}

#' =============================================================================
#' TABLE TO RDF CONVERSION
#' =============================================================================

for (i in seq_len(nrow(data))) {

  # Save ID/IRI for this object
  code <- as.character(data[i, "DIRECTPAYMENTCROP"])

  subject <- rdfhelper::uri(code, prefix = cultivationtype)

  # Static class assignment
  rdfhelper::triple(subject, "a", rdfhelper::uri("CultivationType", base))

  # Dynamic class assignment
  from <- as.character(as.Date(data$VALID_FROM)[i])
  to <- as.character(as.Date(data$VALID_TO)[i])
  construct_class_membership(
    subject,
    uri("DirectPaymentCrop", base),
    identifier = code,
    validFrom = from,
    validTo = to,
    name = "AGIS"
  )

  # Assign labels
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = data[i, paste0("NAME_", toupper(lang))],
        lang = lang
      )
    )
  }

  #' assign crop category by looking up value in LUT
  triple(
    subject = subject,
    predicate = uri("partOf", base),
    object =  subset(
      x = categories,
      subset = CULTIVATIONTYPECATEGORY_DE ==
        data[i, ][["CULTIVATIONTYPECATEGORY_DE"]],
      select = "uri"
    ) %>% unlist()
  )

}

sink()
