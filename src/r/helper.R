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
