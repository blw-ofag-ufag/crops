document.addEventListener('DOMContentLoaded', () => {

    // --- Configuration ---
    const SPARQL_ENDPOINT = 'https://agriculture.ld.admin.ch/query';
    
    const SPARQL_QUERY = `
        PREFIX schema: <http://schema.org/>
        PREFIX : <https://agriculture.ld.admin.ch/crops/>
        
        SELECT DISTINCT ?child ?childName ?parent ?parentName
        WHERE {
          <https://agriculture.ld.admin.ch/crops/cultivationtype/1> :hasPart* ?child .
          ?child :partOf ?parent .
          ?child schema:name ?childName .
          FILTER(LANG(?childName) = "de")
          ?parent schema:name ?parentName .
          FILTER(LANG(?parentName) = "de")
        }
    `;

    // --- DOM Elements ---
    const networkContainer = document.getElementById('network');
    const loaderContainer = document.getElementById('loader-container');
    const infoPanel = document.getElementById('info-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const infoIri = document.getElementById('info-iri');
    const infoName = document.getElementById('info-name');
    const infoDetails = document.getElementById('info-details');

    // --- Vis.js Data ---
    let nodes = new vis.DataSet();
    let edges = new vis.DataSet();
    let network = null;

    // --- Styling Constants ---
    const FONT_DEFAULTS = { size: 14, face: 'Inter', multi: true, mod: 'normal' };

    const STYLE_NORMAL = {
        NODE: { background: '#FFFFFF', border: '#000000' },
        FONT: { ...FONT_DEFAULTS, color: '#000000' },
        // CHANGE: Define hover/highlight to be the same as the base color
        EDGE: { color: '#888888', hover: '#888888', highlight: '#888888' }
    };

    const STYLE_FOCUS = {
        NODE: { background: '#D3E5FA', border: '#4A90E2' },
        FONT: { ...FONT_DEFAULTS, color: '#000000' },
    };

    const STYLE_HIGHLIGHT = {
        NODE: { background: '#000000', border: '#000000' },
        FONT: { ...FONT_DEFAULTS, color: '#FFFFFF' },
        // CHANGE: Define hover/highlight to be the same as the base color
        EDGE: { color: '#000000', hover: '#000000', highlight: '#000000' }
    };

    const STYLE_DIM = {
        // CHANGE: Transparent border on dimmed nodes to fix z-index issue
        NODE: { background: 'rgba(255, 255, 255, 0)', border: 'rgba(255, 255, 255, 0)' },
        FONT: { ...FONT_DEFAULTS, color: '#D0D0D0' },
        // CHANGE: Define hover/highlight to be the same as the base color
        EDGE: { color: '#F0F0F0', hover: '#F0F0F0', highlight: '#F0F0F0' }
    };


    function showLoader(show) {
        loaderContainer.style.display = show ? 'block' : 'none';
        networkContainer.style.visibility = show ? 'hidden' : 'visible';
    }

    async function fetchData() {
        showLoader(true);
        try {
            const response = await fetch(SPARQL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/sparql-results+json' },
                body: `query=${encodeURIComponent(SPARQL_QUERY)}`
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return (await response.json()).results.bindings;
        } catch (error) {
            console.error("Error fetching SPARQL data:", error);
            loaderContainer.innerHTML = `<p>Error loading data. Please try refreshing.</p>`;
            return [];
        }
    }

    function formatLabel(label, maxLineLength = 20, maxTotalLength = 40) {
        if (label.length > maxTotalLength) label = label.substring(0, maxTotalLength - 3) + '...';
        if (label.length > maxLineLength) {
            let breakPoint = label.lastIndexOf(' ', maxLineLength);
            if (breakPoint === -1) breakPoint = maxLineLength;
            return label.substring(0, breakPoint) + '\n' + label.substring(breakPoint + 1).trim();
        }
        return label;
    }

    function processData(bindings) {
        const nodesMap = new Map();
        bindings.forEach(({ child, childName, parent, parentName }) => {
            if (!nodesMap.has(child.value)) nodesMap.set(child.value, { id: child.value, label: formatLabel(childName.value), title: childName.value });
            if (!nodesMap.has(parent.value)) nodesMap.set(parent.value, { id: parent.value, label: formatLabel(parentName.value), title: parentName.value });
            edges.add({ id: `${child.value}-${parent.value}`, from: child.value, to: parent.value });
        });
        nodes.add(Array.from(nodesMap.values()));
    }

    function initGraph() {
        const data = { nodes, edges };
        const options = {
            layout: { hierarchical: { enabled: true, direction: 'RL', sortMethod: 'directed', levelSeparation: 250 } },
            nodes: {
                shape: 'box', margin: 10, widthConstraint: { maximum: 180 },
                color: STYLE_NORMAL.NODE, borderWidth: 1,
                font: STYLE_NORMAL.FONT
            },
            edges: {
                width: 1.5,
                color: STYLE_NORMAL.EDGE, // Passing the whole object disables hover effects
                smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 },
                arrows: { to: { enabled: true, scaleFactor: 0.5 } }
            },
            interaction: { hover: true, tooltipDelay: 200, navigationButtons: true }
        };

        network = new vis.Network(networkContainer, data, options);
        network.on("stabilizationIterationsDone", () => network.setOptions({ physics: false }));
        network.on('selectNode', handleNodeSelection);
        network.on('deselectNode', handleDeselection);
        closePanelBtn.addEventListener('click', () => { network.unselectAll(); handleDeselection(); });
        showLoader(false);
    }
    
    function showInfoPanel(nodeId) {
        const node = nodes.get(nodeId);
        if (!node) return;
        infoIri.textContent = node.id;
        infoName.textContent = node.title;
        infoDetails.textContent = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.";
        infoPanel.classList.add('visible');
    }

    function hideInfoPanel() {
        infoPanel.classList.remove('visible');
    }

    function handleNodeSelection({ nodes: selectedNodes }) {
        if (selectedNodes.length > 0) {
            highlightSelection(selectedNodes[0]);
            showInfoPanel(selectedNodes[0]);
        }
    }

    function handleDeselection() {
        resetHighlight();
        hideInfoPanel();
    }

    function getAllParents(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return visited;
        visited.add(nodeId);
        network.getConnectedNodes(nodeId, 'to').forEach(parentId => getAllParents(parentId, visited));
        return visited;
    }

    function getAllChildren(nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return visited;
        visited.add(nodeId);
        network.getConnectedNodes(nodeId, 'from').forEach(childId => getAllChildren(childId, visited));
        return visited;
    }

    function highlightSelection(selectedNodeId) {
        const highlightedNodeIds = new Set([...getAllParents(selectedNodeId), ...getAllChildren(selectedNodeId)]);
        
        const nodesToUpdate = nodes.map(node => {
            if (node.id === selectedNodeId) {
                return { id: node.id, color: STYLE_FOCUS.NODE, font: STYLE_FOCUS.FONT };
            }
            if (highlightedNodeIds.has(node.id)) {
                return { id: node.id, color: STYLE_HIGHLIGHT.NODE, font: STYLE_HIGHLIGHT.FONT };
            }
            return { id: node.id, color: STYLE_DIM.NODE, font: STYLE_DIM.FONT };
        });

        const edgesToUpdate = edges.map(edge => ({
            id: edge.id,
            color: highlightedNodeIds.has(edge.from) && highlightedNodeIds.has(edge.to) ? STYLE_HIGHLIGHT.EDGE : STYLE_DIM.EDGE
        }));

        nodes.update(nodesToUpdate);
        edges.update(edgesToUpdate);
    }
    
    function resetHighlight() {
        const nodesToUpdate = nodes.map(node => ({
            id: node.id,
            color: STYLE_NORMAL.NODE,
            font: STYLE_NORMAL.FONT
        }));
        const edgesToUpdate = edges.map(edge => ({
            id: edge.id,
            color: STYLE_NORMAL.EDGE
        }));
        nodes.update(nodesToUpdate);
        edges.update(edgesToUpdate);
    }

    fetchData().then(processData).then(initGraph).catch(console.error);
});