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
data <- readxl::read_excel(destfile, sheet = 1)

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

colnames <- paste("Hauptkategorie", toupper(languages), sep = "_")
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
        x = categories[i, paste("Hauptkategorie", toupper(lang), sep = "_")],
        lang = lang
      )
    )
  }

  # Sub-part assignment
  x <- subset(
    data,
    subset = Hauptkategorie_DE == unlist(categories[i, "Hauptkategorie_DE"]),
    select = "LNF_Code"
  ) %>% unlist()
  rdfhelper::triple(
    subject, uri("hasPart", base),
    uri(x, prefix = cultivationtype)
  )
}

#' =============================================================================
#' TABLE TO RDF CONVERSION
#' =============================================================================

for (i in seq_len(nrow(data))) {

  # Save ID/IRI for this object
  code <- as.integer(data[i, "LNF_Code"])
  subject <- rdfhelper::uri(code, prefix = cultivationtype)

  # Static class assignment
  rdfhelper::triple(subject, "a", rdfhelper::uri("CultivationType", base))

  # Dynamic class assignment
  from <- data[i, "Gueltig_Von"]
  to <- data[i, "Gueltig_Bis"]
  construct_class_membership(
    subject,
    uri("DirectPaymentCrop", base),
    identifier = code,
    validFrom = if (as.logical(is.na(from))) {
      "2000-01-01"
    } else {
      paste0(as.character(from), "-01-01")
    },
    validTo = if (as.logical(is.na(to))) {
      NULL
    } else {
      paste0(as.character(to), "-12-31")
    },
    name = "AGIS"
  )


  # Assign labels
  for (lang in languages) {
    rdfhelper::triple(
      subject = subject,
      predicate = rdfhelper::uri("name", schema),
      object = rdfhelper::langstring(
        x = data[i, paste0("Nutzung_", toupper(lang))],
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
      subset = Hauptkategorie_DE == data[i, ][["Hauptkategorie_DE"]],
      select = "uri"
    ) %>% unlist()
  )

}

sink()
