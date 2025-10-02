library(rdfhelper)

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
