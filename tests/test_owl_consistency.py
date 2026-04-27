import os
import tempfile
import pytest
from rdflib import Graph
from owlready2 import get_ontology, sync_reasoner, OwlReadyInconsistentOntologyError, Nothing
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TTL_FILE_PATH = BASE_DIR / "rdf" / "ontology" / "cultivationtypes.ttl"

@pytest.fixture
def translated_ontology_path():
    """
    Fixture: Parses the TTL file with rdflib, translates it to RDF/XML, 
    saves it to a temporary file, and yields the file path to the test.
    Cleans up the temporary file automatically after the test finishes.
    """
    # 1. Ensure the file exists before testing
    assert os.path.exists(TTL_FILE_PATH), f"Ontology file not found at: {TTL_FILE_PATH}"

    # 2. Parse with rdflib
    g = Graph()
    try:
        g.parse(TTL_FILE_PATH, format="turtle")
    except Exception as e:
        pytest.fail(f"rdflib failed to parse the TTL file. Syntax error: {e}")

    # 3. Create a temporary file for the RDF/XML translation
    # mkstemp returns a file descriptor and an absolute path
    fd, temp_path = tempfile.mkstemp(suffix=".xml")
    os.close(fd) 

    # Serialize and yield to the test
    try:
        g.serialize(destination=temp_path, format="xml")
        yield temp_path
        
    # 4. Teardown: Clean up the temporary file so it doesn't clutter your system
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def test_cultivation_types_consistency(translated_ontology_path):
    """
    Test: Loads the RDF/XML ontology into Owlready2, runs the HermiT reasoner,
    and asserts both ABox consistency and TBox satisfiability.
    """
    # 1. Load into Owlready2
    try:
        onto = get_ontology(f"file://{translated_ontology_path}").load()
    except Exception as e:
        pytest.fail(f"Owlready2 failed to load the translated ontology: {e}")

    # 2. Run the reasoner (Catches ABox data contradictions)
    try:
        with onto:
            sync_reasoner()
    except OwlReadyInconsistentOntologyError as e:
        pytest.fail(f"Ontology data is INCONSISTENT. Reasoner output: {e}")

    # 3. Check for Unsatisfiable Classes (Catches TBox schema errors)
    # Any class with contradictory definitions (like being a subclass of a disjoint class) 
    # silently becomes a subclass of owl:Nothing during reasoning.
    unsatisfiable_classes = list(onto.classes())
    broken_classes = [cls for cls in unsatisfiable_classes if Nothing in cls.ancestors()]

    if broken_classes:
        class_names = [cls.name for cls in broken_classes]
        pytest.fail(
            f"Ontology logic is invalid: Found UNSATISFIABLE classes (empty sets due to contradictory axioms). "
            f"Broken classes: {class_names}"
        )