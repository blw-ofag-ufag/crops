document.addEventListener('DOMContentLoaded', () => {

    // Configuration
    const SPARQL_ENDPOINT = 'https://agriculture.ld.admin.ch/query';
    
    // CONSTRUCT query to get all relevant triples for the hierarchy
    const CONSTRUCT_QUERY = `
        PREFIX schema: <http://schema.org/>
        PREFIX : <https://agriculture.ld.admin.ch/crops/>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

        CONSTRUCT {
            ?node a :CultivationType ;
                schema:name ?nodeName ;
                schema:description ?description ;
                :partOf ?parent ;
                :botanicalPlant ?botanicalPlant .
            
            ?parent a :CultivationType ;
                schema:name ?parentName .

            ?botanicalPlant :taxonName ?taxonName ;
                :eppo ?eppoCode .
        }
        WHERE {
            <https://agriculture.ld.admin.ch/crops/cultivationtype/1> :hasPart* ?node .
            
            ?node schema:name ?nodeName .
            FILTER(LANG(?nodeName) = "de")

            OPTIONAL {
                ?node :partOf ?parent .
                ?parent schema:name ?parentName .
                FILTER(LANG(?parentName) = "de")
            }
            
            OPTIONAL {
                ?node schema:description ?description .
                FILTER(LANG(?description) = "de")
            }
            
            OPTIONAL {
                ?node :botanicalPlant ?botanicalPlant .
                OPTIONAL { ?botanicalPlant :taxonName ?taxonName . }
                OPTIONAL { ?botanicalPlant :eppo ?eppoCode . }
            }
        }
    `;

    // JSON-LD Frame to structure the CONSTRUCT query results into a hierarchy
    const JSON_FRAME = {
        "@context": {
            "schema": "http://schema.org/",
            "crops": "https://agriculture.ld.admin.ch/crops/",
            "name": { "@id": "schema:name", "@language": "de" },
            "description": { "@id": "schema:description", "@language": "de" },
            "partOf": { "@id": "crops:partOf", "@type": "@id" },
            "botanicalPlant": { "@id": "crops:botanicalPlant", "@type": "@id" },
            "taxonName": { "@id": "crops:taxonName" },
            "eppoCode": { "@id": "crops:eppo", "@type": "@id" } // Be explicit that eppoCode is an IRI
        },
        "@type": "crops:CultivationType"
    };

    // DOM Elements
    const networkContainer = document.getElementById('network');
    const loaderContainer = document.getElementById('loader-container');
    const infoPanel = document.getElementById('info-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const infoIri = document.getElementById('info-iri');
    const infoName = document.getElementById('info-name');
    const infoDetails = document.getElementById('info-details');
    const botanicalInfo = document.getElementById('botanical-info');

    // Vis.js Data
    let nodes = new vis.DataSet();
    let edges = new vis.DataSet();
    let network = null;

    // Styling Constants
    const FONT_DEFAULTS = { size: 14, face: 'Inter', multi: true };
    const STYLE_NORMAL = { NODE: { background: '#FFFFFF', border: '#000000' }, FONT: { ...FONT_DEFAULTS, color: '#000000' }, EDGE: { color: '#888888', hover: '#888888', highlight: '#888888' } };
    const STYLE_FOCUS = { NODE: { background: '#D3E5FA', border: '#4A90E2' }, FONT: { ...FONT_DEFAULTS, color: '#000000' } };
    const STYLE_HIGHLIGHT = { NODE: { background: '#000000', border: '#000000' }, FONT: { ...FONT_DEFAULTS, color: '#FFFFFF' }, EDGE: { color: '#000000', hover: '#000000', highlight: '#000000' } };
    const STYLE_DIM = { NODE: { background: 'rgba(255, 255, 255, 0)', border: 'rgba(255, 255, 255, 0)' }, FONT: { ...FONT_DEFAULTS, color: '#D0D0D0' }, EDGE: { color: '#F0F0F0', hover: '#F0F0F0', highlight: '#F0F0F0' } };


    function showLoader(show) {
        loaderContainer.style.display = show ? 'block' : 'none';
        networkContainer.style.visibility = show ? 'hidden' : 'visible';
    }

    async function fetchData() {
        showLoader(true);
        try {
            const params = new URLSearchParams();
            params.append('query', CONSTRUCT_QUERY);
            const response = await fetch(SPARQL_ENDPOINT, {
                method: 'POST',
                headers: { 'Accept': 'application/ld+json', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error("Error fetching SPARQL data:", error);
            loaderContainer.innerHTML = `<p>Error loading data. Please try refreshing.</p>`;
            return null;
        }
    }

    async function frameDataClientSide(rawJsonLd) {
        if (!rawJsonLd) return null;
        try {
            return await jsonld.frame(rawJsonLd, JSON_FRAME);
        } catch (error) {
            console.error("Error framing JSON-LD data:", error);
            loaderContainer.innerHTML = `<p>Error processing data.</p>`;
            return null;
        }
    }

    function formatLabel(label, maxLineLength = 20, maxTotalLength = 40) {
        if (!label) return '';
        if (label.length > maxTotalLength) label = label.substring(0, maxTotalLength - 3) + '...';
        if (label.length > maxLineLength) {
            let breakPoint = label.lastIndexOf(' ', maxLineLength);
            if (breakPoint === -1) breakPoint = maxLineLength;
            return label.substring(0, breakPoint) + '\n' + label.substring(breakPoint + 1).trim();
        }
        return label;
    }

    function processFramedData(framedResult) {
        if (!framedResult || !framedResult['@graph']) return;

        const nodesMap = new Map();
        const edgesSet = new Set();

        const processNodeObject = (nodeObj) => {
            const nodeId = nodeObj['@id'];
            if (!nodeId) return;

            // **** START OF BUG FIX ****
            // Extract botanical info and ensure eppoCode is a string, not an object.
            const botanicalPlant = nodeObj.botanicalPlant;
            let taxonName = botanicalPlant?.taxonName || null;
            // The value from framing is the full IRI string, which is what we want.
            let eppoCode = botanicalPlant?.eppoCode || null; 
            // **** END OF BUG FIX ****

            if (!nodesMap.has(nodeId)) {
                nodesMap.set(nodeId, {
                    id: nodeId,
                    label: formatLabel(nodeObj.name || nodeId.split('/').pop()),
                    title: nodeObj.name || nodeId.split('/').pop(),
                    description: nodeObj.description || "Keine Beschreibung verfügbar.",
                    // Use the corrected variables
                    taxonName: taxonName,
                    eppoCode: eppoCode
                });
            }

            if (nodeObj.partOf) {
                const parents = Array.isArray(nodeObj.partOf) ? nodeObj.partOf : [nodeObj.partOf];
                parents.forEach(parent => {
                    const parentId = (typeof parent === 'object' && parent['@id']) ? parent['@id'] : parent;
                    
                    if (typeof parent === 'object' && parent['@id']) {
                        processNodeObject(parent);
                    } else if (!nodesMap.has(parentId)) {
                        nodesMap.set(parentId, {
                            id: parentId,
                            label: formatLabel(parentId.split('/').pop()),
                            title: parentId.split('/').pop(),
                            description: "Keine Beschreibung für diesen Eintrag verfügbar.",
                            taxonName: null,
                            eppoCode: null
                        });
                    }

                    const edgeId = `${nodeId}-${parentId}`;
                    if (!edgesSet.has(edgeId)) {
                        edges.add({ id: edgeId, from: nodeId, to: parentId });
                        edgesSet.add(edgeId);
                    }
                });
            }
        };

        framedResult['@graph'].forEach(processNodeObject);
        nodes.add(Array.from(nodesMap.values()));
    }

    function initGraph() {
        const data = { nodes, edges };
        const options = {
            layout: { hierarchical: { enabled: true, direction: 'RL', sortMethod: 'directed', levelSeparation: 250 } },
            nodes: { shape: 'box', margin: 10, widthConstraint: { maximum: 180 }, color: STYLE_NORMAL.NODE, borderWidth: 1, font: STYLE_NORMAL.FONT },
            edges: { width: 1.5, color: STYLE_NORMAL.EDGE, smooth: { type: 'cubicBezier', forceDirection: 'vertical', roundness: 0.4 }, arrows: { to: { enabled: true, scaleFactor: 0.5 } } },
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
        
        const baseIri = 'https://agriculture.ld.admin.ch/crops/cultivationtype/';
        let curieText = node.id;
        if (node.id.startsWith(baseIri)) {
            curieText = `:${node.id.substring(baseIri.length)}`;
        }
        infoIri.href = node.id;
        infoIri.textContent = curieText;
        
        infoName.textContent = node.title;
        infoDetails.textContent = node.description;
        
        let botanicalHtml = '';
        if (node.taxonName) {
            botanicalHtml = `<strong>Botanische Bezeichnung:</strong> <em>${node.taxonName}</em>`;
            // This code now works because node.eppoCode is guaranteed to be a string or null.
            if (node.eppoCode) {
                const eppoSlug = node.eppoCode.split('/').pop();
                botanicalHtml += ` (<a href="${node.eppoCode}" target="_blank" rel="noopener noreferrer">${eppoSlug}</a>)`;
            }
        }
        botanicalInfo.innerHTML = botanicalHtml;
        botanicalInfo.style.display = botanicalHtml ? 'block' : 'none';

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
            if (node.id === selectedNodeId) return { id: node.id, color: STYLE_FOCUS.NODE, font: STYLE_FOCUS.FONT };
            if (highlightedNodeIds.has(node.id)) return { id: node.id, color: STYLE_HIGHLIGHT.NODE, font: STYLE_HIGHLIGHT.FONT };
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
        const nodesToUpdate = nodes.map(node => ({ id: node.id, color: STYLE_NORMAL.NODE, font: STYLE_NORMAL.FONT }));
        const edgesToUpdate = edges.map(edge => ({ id: edge.id, color: STYLE_NORMAL.EDGE }));
        nodes.update(nodesToUpdate);
        edges.update(edgesToUpdate);
    }

    // Updated execution chain
    fetchData()
        .then(frameDataClientSide)
        .then(processFramedData)
        .then(initGraph)
        .catch(console.error);
});