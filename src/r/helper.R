library(rdfhelper) # from https://github.com/damian-oswald/rdfhelper

construct_code <- function(subject, code, name) {
  bnode <- paste0("_:", rlang::hash(code))
  rdfhelper::triple(
    subject,
    rdfhelper::uri("http://schema.org/identifier"),
    bnode
  )
  rdfhelper::triple(
    subject = bnode,
    predicate = rdfhelper::uri("http://schema.org/value"),
    object = rdfhelper::typed(code, "ID")
  )
  rdfhelper::triple(
    subject = bnode,
    predicate = rdfhelper::uri("http://schema.org/name"),
    rdfhelper::literal(name)
  )
}

construct_class_membership <- function(
  subject,
  class,
  identifier = NULL,
  validFrom = NULL,
  validTo = NULL,
  name = NULL
) {
  bnode <- paste0("_:", rlang::hash(paste0(subject, class)))
  rdfhelper::triple(
    subject,
    rdfhelper::uri("https://agriculture.ld.admin.ch/crops/hasMembership"),
    bnode
  )
  rdfhelper::triple(
    subject = bnode,
    rdfhelper::uri("https://agriculture.ld.admin.ch/crops/memberOfClass"),
    object = class
  )
  for (x in c("identifier", "validFrom", "validTo", "name")) {
    if (!is.null(get(x))) {
      rdfhelper::triple(
        subject = bnode,
        rdfhelper::uri(x, "http://schema.org/"),
        object = rdfhelper::typed(
          get(x), if (x == "identifier") {
            "ID"
          } else if (x == "name") {
            "string"
          } else {
            "date"
          }
        )
      )
    }
  }
}


# Read prefixes

read_prefixes_ttl <- function(file_path) {
  lines <- readLines(file_path, warn = FALSE)
  lines <- lines[grepl("^@prefix", lines)]

  # Extract the prefix name (everything between '@prefix ' and the ':')
  p_names <- trimws(sub("^@prefix\\s+([^:]*):.*", "\\1", lines))
  # Turn the empty prefix into "base"
  p_names[p_names == ""] <- "base"

  # Extract the URI
  p_uris <- sub(".*<([^>]+)>.*", "\\1", lines)

  # Bind them together into a named vector
  return(setNames(p_uris, p_names))
}


# Write prefixes
write_global_prefixes <- function(x) {
  for (prefix in names(x)) {
    # If the prefix is "base", print it as an empty string
    print_prefix <- ifelse(prefix == "base", "", prefix)

    cat(sprintf("@prefix %s: <%s> .\n", print_prefix, x[[prefix]]))
  }
  cat("\n")
}

#  URI builder
qname <- function(prefix_list, prefix, local_name) {
  if (!prefix %in% names(prefix_list)) {
    stop(sprintf("ERROR: Prefix '%s' is not defined in GLOBAL_PREFIXES.", prefix))
  }

  # change "base" prefix to " :local_name"
  if (prefix == "base") {
    return(paste0(":", local_name))
  }

  paste0(prefix, ":", local_name)
}
