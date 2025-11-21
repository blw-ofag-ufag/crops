document.addEventListener('DOMContentLoaded', () => {

    // Configuration
    const SPARQL_ENDPOINT = 'https://agriculture.ld.admin.ch/query';
    
    // Initialize state from URL parameters
    function getInitialFilters() {
        const params = new URLSearchParams(window.location.search);
        const system = params.get('system') || ""; // Empty string = no filter
        const dateStr = params.get('date');
        
        // Default to Today if not specified
        const date = dateStr ? new Date(dateStr) : new Date();
        
        return { system, date };
    }

    // Mutable State
    let activeFilters = getInitialFilters();
    console.log("Initial Filters:", activeFilters);

    // Helper to format date for HTML input (YYYY-MM-DD)
    function toISODate(dateObj) {
        return dateObj.toISOString().split('T')[0];
    }

    const networkContainer = document.getElementById('network');
    const loaderContainer = document.getElementById('loader-container');
    
    // Info Panel Elements
    const infoPanel = document.getElementById('info-panel');
    const closePanelBtn = document.getElementById('close-panel-btn');
    const infoIri = document.getElementById('info-iri');
    const infoName = document.getElementById('info-name');
    const infoDetails = document.getElementById('info-details');
    const botanicalInfo = document.getElementById('botanical-info');
    const membershipInfo = document.getElementById('membership-info');
    const attributesInfo = document.getElementById('attributes-info');

    // Settings Modal Elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const applySettingsBtn = document.getElementById('apply-settings-btn');
    const systemSelect = document.getElementById('system-select');
    const dateInput = document.getElementById('date-input');

    function openSettings() {
        // Populate inputs with current state
        systemSelect.value = activeFilters.system;
        dateInput.value = toISODate(activeFilters.date);
        
        settingsModal.classList.remove('hidden');
    }

    function closeSettings() {
        settingsModal.classList.add('hidden');
    }

    function applySettings() {
        const newSystem = systemSelect.value;
        const newDateStr = dateInput.value;

        // Update State
        activeFilters.system = newSystem;
        activeFilters.date = newDateStr ? new Date(newDateStr) : new Date();

        // Update URL without reloading (optional, for shareability)
        const url = new URL(window.location);
        if(newSystem) url.searchParams.set('system', newSystem);
        else url.searchParams.delete('system');
        
        if(newDateStr) url.searchParams.set('date', newDateStr);
        
        window.history.pushState({}, '', url);

        console.log("Filters Updated:", activeFilters);
        
        // Re-color the graph
        refreshGraphColors();
        
        closeSettings();
    }

    settingsBtn.addEventListener('click', openSettings);
    closeModalBtn.addEventListener('click', closeSettings);
    applySettingsBtn.addEventListener('click', applySettings);
    
    // Close modal on background click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    let nodes = new vis.DataSet();
    let edges = new vis.DataSet();
    let network = null;

    // Query & Frame (Unchanged from prompt)
    const CONSTRUCT_QUERY = `
        PREFIX schema: <http://schema.org/>
        PREFIX : <https://agriculture.ld.admin.ch/crops/>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

        CONSTRUCT {
            ?node a :CultivationType ;
                schema:name ?nodeName ;
                schema:description ?description ;
                :partOf ?parent ;
                :botanicalPlant ?botanicalPlant ;
                :hasMembership ?membership ;
                :hasAttribute ?attribute .

            ?attribute :attributeType ?attributeType ;
                       :attributeValue ?attributeValue .

            ?attributeType schema:name ?attributeTypeName .
            ?attributeValue schema:name ?attributeValueName .
            ?parent a :CultivationType ;
                schema:name ?parentName .
            ?botanicalPlant :taxonName ?taxonName ;
                :eppo ?eppoCode .
            ?membership schema:identifier ?identifier ;
                schema:name ?membershipName ;
                schema:validFrom ?validFrom ;
                schema:validTo ?validTo .
        }
        WHERE {
            ?node a :CultivationType .
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
            OPTIONAL {
                ?node :hasMembership ?membership .
                ?membership schema:name ?membershipName .
                ?membership schema:identifier ?identifier .
                OPTIONAL { ?membership schema:validFrom ?validFrom . }
                OPTIONAL { ?membership schema:validTo ?validTo . }
            }
            OPTIONAL {
                VALUES ?attributeType { :intensity :purpose :cultivationMethod }
                ?node ?attributeType ?attributeValue .
                BIND(BNODE() AS ?attribute)
                ?attributeType schema:name ?attributeTypeName .
                FILTER(LANG(?attributeTypeName) = "de")
                ?attributeValue schema:name ?attributeValueName .
                FILTER(LANG(?attributeValueName) = "de")
            }
        }
    `;

    const JSON_FRAME = {
        "@context": {
            "schema": "http://schema.org/",
            "crops": "https://agriculture.ld.admin.ch/crops/",
            "name": { "@id": "schema:name", "@language": "de" },
            "description": { "@id": "schema:description", "@language": "de" },
            "partOf": { "@id": "crops:partOf", "@type": "@id" },
            "botanicalPlant": { "@id": "crops:botanicalPlant", "@type": "@id" },
            "taxonName": { "@id": "crops:taxonName" },
            "eppoCode": { "@id": "crops:eppo", "@type": "@id" },
            "hasMembership": { "@id": "crops:hasMembership", "@container": "@set" },
            "identifier": { "@id": "schema:identifier", "@type": "xsd:string" },
            "membershipName": "schema:name",
            "validFrom": { "@id": "schema:validFrom", "@type": "xsd:date" },
            "validTo": { "@id": "schema:validTo", "@type": "xsd:date" },            
            "hasAttribute": { "@id": "crops:hasAttribute", "@container": "@set" },
            "attributeType": { "@id": "crops:attributeType", "@type": "@id" },
            "attributeValue": { "@id": "crops:attributeValue", "@type": "@id" }
        },
        "@type": "crops:CultivationType"
    };

    // Styling Constants
    const FONT_DEFAULTS = { size: 14, face: 'Inter', multi: true };
    
    const STYLE_NORMAL = { 
        NODE: { background: '#FFFFFF', border: '#000000' }, 
        FONT: { ...FONT_DEFAULTS, color: '#000000' }, 
        EDGE: { color: '#888888', hover: '#888888', highlight: '#888888' } 
    };
    
    const STYLE_FOCUS = { 
        NODE: { background: '#D3E5FA', border: '#4A90E2' }, 
        FONT: { ...FONT_DEFAULTS, color: '#000000' } 
    };
    
    const STYLE_HIGHLIGHT = { 
        NODE: { background: '#000000', border: '#000000' }, 
        FONT: { ...FONT_DEFAULTS, color: '#FFFFFF' }, 
        EDGE: { color: '#000000', hover: '#000000', highlight: '#000000' } 
    };

    const STYLE_DIM = { 
        NODE: { background: 'rgba(255, 255, 255, 0)', border: 'rgba(255, 255, 255, 0)' }, 
        FONT: { ...FONT_DEFAULTS, color: '#D0D0D0' }, 
        EDGE: { color: '#F0F0F0', hover: '#F0F0F0', highlight: '#F0F0F0' } 
    };

    const STYLE_SYSTEM = {
        NODE: { background: '#66BB6A', border: '#000000' },
        FONT: { ...FONT_DEFAULTS, color: '#FFFFFF' },
    };

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

    function formatLabel(label, maxLineLength = 35, maxTotalLength = 35) {
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

            const botanicalPlant = nodeObj.botanicalPlant;
            let taxonName = botanicalPlant?.taxonName || null;
            let eppoCode = botanicalPlant?.eppoCode || null;

            const memberships = Array.isArray(nodeObj.hasMembership) ? nodeObj.hasMembership : (nodeObj.hasMembership ? [nodeObj.hasMembership] : []);            
            const attributes = Array.isArray(nodeObj.hasAttribute) ? nodeObj.hasAttribute : (nodeObj.hasAttribute ? [nodeObj.hasAttribute] : []);

            if (!nodesMap.has(nodeId)) {
                nodesMap.set(nodeId, {
                    id: nodeId,
                    label: formatLabel(nodeObj.name || nodeId.split('/').pop()),
                    title: nodeObj.name || nodeId.split('/').pop(),
                    description: nodeObj.description || "Keine Beschreibung verfügbar.",
                    taxonName: taxonName,
                    eppoCode: eppoCode,
                    memberships: memberships,
                    attributes: attributes
                });
            }

            if (nodeObj.partOf) {
                const parents = Array.isArray(nodeObj.partOf) ? nodeObj.partOf : [nodeObj.partOf];
                parents.forEach(parent => {
                    const parentId = (typeof parent === 'object' && parent['@id']) ? parent['@id'] : parent;
                    if (typeof parent === 'object' && parent['@id']) {
                        processNodeObject(parent);
                    } else if (!nodesMap.has(parentId)) {
                        // Placeholder if parent details aren't fetched yet (shouldn't happen with Construct usually)
                        nodesMap.set(parentId, {
                            id: parentId,
                            label: formatLabel(parentId.split('/').pop()),
                            title: parentId.split('/').pop(),
                            description: "Keine Beschreibung verfügbar.",
                            memberships: [], attributes: []
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
        const options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'RL',
                    sortMethod: 'directed',
                    levelSeparation: 300
                }
            },
            nodes: {
                shape: 'box',
                margin: 10,
                widthConstraint: { maximum: 700 }, 
                borderWidth: 1
            },
            edges: { 
                width: 1.5,
                smooth: {
                    type: 'cubicBezier',
                    forceDirection: 'vertical',
                    roundness: 0.4 
                },
                arrows: {
                    to: { 
                        enabled: true,
                        scaleFactor: 0.5
                    }
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                navigationButtons: true
            }
        };
        network = new vis.Network(networkContainer, { nodes, edges }, options);

        // Turn off physics after stabilization to allow manual updates without re-simulating
        network.on("stabilizationIterationsDone", () => network.setOptions({ physics: false }));
        network.on('selectNode', handleNodeSelection);
        network.on('deselectNode', handleDeselection);

        closePanelBtn.addEventListener('click', () => { network.unselectAll(); handleDeselection(); });        
        refreshGraphColors(); 
        showLoader(false);
    }

    function isNodeSystemActive(node) {
        if (!activeFilters.system) return false; // No system selected = no highlight (normal view)
        
        if (!node.memberships || node.memberships.length === 0) return false;

        return node.memberships.some(m => {
            // Check Name Match
            if (m.membershipName !== activeFilters.system) return false;

            // Check Date Validity
            let validFromStr = (m['schema:validFrom'] && m['schema:validFrom']['@value']) ? m['schema:validFrom']['@value'] : m['schema:validFrom'];
            let validToStr = (m['schema:validTo'] && m['schema:validTo']['@value']) ? m['schema:validTo']['@value'] : m['schema:validTo'];
            
            const checkDate = activeFilters.date;
            if (validFromStr) {
                const fromDate = new Date(validFromStr);
                if (checkDate < fromDate) return false;
            }
            if (validToStr) {
                const toDate = new Date(validToStr);
                if (checkDate > toDate) return false;
            }
            return true;
        });
    }

    // Centralized function to redraw the graph colors
    function refreshGraphColors() {
        const selectedIds = network ? network.getSelectedNodes() : [];
        if (selectedIds.length > 0) {
            // If user has a node clicked, maintain focus on that
            highlightSelection(selectedIds[0]);
        } else {
            // Otherwise standard view (with system highlights applied)
            resetHighlight();
        }
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
            const isSystem = isNodeSystemActive(node);

            // Selected Node (User Focus) -> Blue
            if (node.id === selectedNodeId) {
                return { id: node.id, color: STYLE_FOCUS.NODE, font: STYLE_FOCUS.FONT };
            }

            // Hierarchy (Lineage)
            if (highlightedNodeIds.has(node.id)) {
                // If in lineage AND System Active -> Green (System Style)
                if (isSystem) {
                    return { id: node.id, color: STYLE_SYSTEM.NODE, font: STYLE_SYSTEM.FONT };
                }
                // If just in lineage -> Black (Highlight Style)
                return { id: node.id, color: STYLE_HIGHLIGHT.NODE, font: STYLE_HIGHLIGHT.FONT };
            }

            // Background (Dimmed)
            // Even if a node is system active, if it's not in the lineage, we dim it to focus on the selection.
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
        const nodesToUpdate = nodes.map(node => {
            // If a system filter is active, highlight applicable nodes GREEN, else NORMAL white
            if (isNodeSystemActive(node)) {
                return { id: node.id, color: STYLE_SYSTEM.NODE, font: STYLE_SYSTEM.FONT };
            } else {
                return { id: node.id, color: STYLE_NORMAL.NODE, font: STYLE_NORMAL.FONT };
            }
        });

        const edgesToUpdate = edges.map(edge => ({ id: edge.id, color: STYLE_NORMAL.EDGE }));
        
        nodes.update(nodesToUpdate);
        edges.update(edgesToUpdate);
    }

    function showInfoPanel(nodeId) {
        const node = nodes.get(nodeId);
        if (!node) return;

        const compactedId = node.id;
        const fullIri = compactedId.replace('crops:', 'https://agriculture.ld.admin.ch/crops/');
        infoIri.href = fullIri;
        const idNumber = compactedId.split('/').pop();
        infoIri.textContent = `:${idNumber}`;

        infoName.textContent = node.title;
        infoDetails.textContent = node.description;

        // Botanical Info
        let botanicalHtml = '';
        if (node.taxonName || node.eppoCode) {
            botanicalHtml += '<strong>Botanische Pflanze</strong>';
            if (node.taxonName) botanicalHtml += `<p><b>Name:</b> <em>${node.taxonName}</em></p>`;
            if (node.eppoCode) {
                const eppoSlug = node.eppoCode.split('/').pop();
                botanicalHtml += `<p><b>EPPO-Code:</b> <a href="${node.eppoCode}" target="_blank" rel="noopener noreferrer">${eppoSlug}</a></p>`;
            }
        }
        botanicalInfo.innerHTML = botanicalHtml;
        botanicalInfo.style.display = botanicalHtml ? 'block' : 'none';

        // Membership Info
        let membershipHtml = '';
        if (node.memberships && node.memberships.length > 0) {
            membershipHtml += '<strong>Quellsysteme</strong>';
            node.memberships.forEach(membership => {
                const identifierObj = membership['schema:identifier'];
                const validFromObj = membership['schema:validFrom'];
                const validToObj = membership['schema:validTo'];
                
                let identifier = 'N/A';
                if (identifierObj) {
                    identifier = typeof identifierObj === 'object' && identifierObj['@value'] !== undefined 
                        ? identifierObj['@value'] 
                        : identifierObj;
                }

                membershipHtml += `<div class="membership-item">`;
                membershipHtml += `<p><b>System:</b> ${membership.membershipName || 'N/A'}</p>`;
                membershipHtml += `<p><b>ID:</b> ${identifier}</p>`;

                const validFromYear = validFromObj && validFromObj['@value'] ? new Date(validFromObj['@value']).getFullYear() : (validFromObj ? new Date(validFromObj).getFullYear() : 'Start');
                const validToDate = validToObj && validToObj['@value'] ? new Date(validToObj['@value']) : null;
                const validToYear = validToDate ? validToDate.getFullYear() : 'heute';

                if (validFromObj || validToObj) {
                    membershipHtml += `<p><b>Gültigkeit:</b> ${validFromYear} – ${validToYear}</p>`;
                }
                membershipHtml += `</div>`;
            });
        }
        membershipInfo.innerHTML = membershipHtml;
        membershipInfo.style.display = membershipHtml ? 'block' : 'none';

        let attributesHtml = '';
        const attributes = node.attributes;
        if (attributes && attributes.length > 0) {
            const groupedAttributes = attributes.reduce((acc, attr) => {
                const typeName = attr.attributeType?.name;
                const valueName = attr.attributeValue?.name;
                if (typeName && valueName) {
                    if (!acc[typeName]) acc[typeName] = new Set();
                    acc[typeName].add(valueName);
                }
                return acc;
            }, {});

            let panelContent = '';
            for (const [typeName, valueNames] of Object.entries(groupedAttributes)) {
                const valuesString = Array.from(valueNames).join(', ');
                panelContent += `<p class="attribute-item"><b>${typeName}:</b> ${valuesString}</p>`;
            }

            if (panelContent) attributesHtml = `<strong>Attribute</strong>${panelContent}`;
        }
        attributesInfo.innerHTML = attributesHtml;
        attributesInfo.style.display = attributesHtml ? 'block' : 'none';

        infoPanel.classList.add('visible');
    }

    function hideInfoPanel() {
        infoPanel.classList.remove('visible');
    }

    fetchData()
        .then(frameDataClientSide)
        .then(processFramedData)
        .then(initGraph)
        .catch(console.error);
});