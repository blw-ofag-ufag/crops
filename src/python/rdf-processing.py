import argparse
import sys
from pathlib import Path
from typing import List
from rdflib import Graph, Namespace
from otsrdflib import OrderedTurtleSerializer

def load_inputs(paths: List[Path]) -> Graph:
    """
    Initializes a single Graph and parses multiple source files into it.
    """
    g = Graph()
    for path in paths:
        try:
            g.parse(str(path), format="turtle")
            print(f"[+] Loaded triples from {path}")
        except Exception as e:
            print(f"[!] Error loading {path}: {e}", file=sys.stderr)
            sys.exit(1)

    print(f"[i] Total graph size: {len(g)} triples")
    return g

def apply_rules(graph: Graph, rules: List[Path]):
    """
    Applies SPARQL Update (INSERT/DELETE) queries to the graph.
    Assumes all provided rules strictly follow the SPARQL UPDATE syntax.
    """
    print(f"[i] Applying {len(rules)} inference rules")

    for rule_path in rules:
        if not rule_path.exists():
            print(f"[!] Rule file not found: {rule_path}", file=sys.stderr)
            continue

        with open(rule_path, "r") as f:
            query_string = f.read()

        try:
            # 1. Snapshot the initial state
            before_triples = set(graph)

            # 2. Execute the mutation (INSERT/DELETE)
            graph.update(query_string)

            # 3. Compute the structural delta
            after_triples = set(graph)
            added = len(after_triples - before_triples)
            removed = len(before_triples - after_triples)

            print(f"  -> {rule_path.name}: +{added}/-{removed} triples")

        except Exception as e:
            print(f"[!] Error executing update {rule_path.name}: {e}", file=sys.stderr)

def save_graph(graph: Graph, output_path: Path):
    """
    Serializes the graph to the specified output path using OrderedTurtleSerializer.
    """
    print(f"[+] Writing {len(graph)} triples to {output_path}")
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. Force Schema.org binding (http) prior to serialization
    try:
        graph.bind("schema", Namespace("http://schema.org/"), override=True, replace=True)
    except TypeError:
        # Compatibility fallback for legacy rdflib implementations
        graph.bind("schema", Namespace("http://schema.org/"), override=True)

    # 2. Serialize
    with open(output_path, "wb") as f:
        serializer = OrderedTurtleSerializer(graph)
        serializer.serialize(f)

def main():
    parser = argparse.ArgumentParser(
        description="RDF CLI tool: sorts, merges, and optionally reasons over RDF data via SPARQL UPDATE."
    )

    parser.add_argument(
        "-i", "--input", 
        nargs="+", 
        type=Path, 
        required=True,
        help="One or more input turtle RDF files (.ttl format)."
    )

    parser.add_argument(
        "-o", "--output", 
        type=Path, 
        required=True,
        help="Destination path for the materialized/sorted graph."
    )

    parser.add_argument(
        "-r", "--rules", 
        nargs="+", 
        type=Path, 
        required=False,
        help="Optional: One or more SPARQL UPDATE rule files (.rq or .sparql)."
    )

    args = parser.parse_args()

    # 1. Load Data
    full_graph = load_inputs(args.input)

    # 2. Execute SPARQL Mutations
    if args.rules:
        apply_rules(full_graph, args.rules)

    # 3. Serialize Output
    save_graph(full_graph, args.output)

if __name__ == "__main__":
    main()