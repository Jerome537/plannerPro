// Configuration de l'application
const config = {
    gridSize: 20,
    snapToGrid: true,
    defaultObjectSize: { width: 100, height: 100 },
    scale: 1,
    zoom: 1,
    minZoom: 0.25,
    maxZoom: 4
};

// État de l'application
let appState = {
    mode: 'select',
    selectedObject: null,
    objects: [],
    layers: [{ id: 1, name: 'Calque 1', visible: true, locked: false }],
    currentLayer: 1,
    isDragging: false,
    resizing: false,
    resizeHandle: null,
    originalDimensions: null,
    dragStart: { x: 0, y: 0 },
    canvasOffset: { x: 0, y: 0 },
    showGrid: true
};

// Initialisation du canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Classe pour les objets du plan
class PlanObject {
    constructor(x, y, type, subtype) {
        this.id = Date.now() + Math.random();
        this.x = x;
        this.y = y;
        this.type = type;
        this.subtype = subtype;
        this.width = this.getDefaultWidth();
        this.height = this.getDefaultHeight();
        this.widthLeft = this.width / 2;
        this.widthRight = this.width / 2;
        this.heightTop = this.height / 2;
        this.heightBottom = this.height / 2;
        this.rotation = 0;
        this.color = this.getDefaultColor();
        this.name = this.getDefaultName();
        this.layer = appState.currentLayer;
        this.locked = false;
        this.visible = true;
        this.zIndex = Date.now();
        this.realWidth = this.width * config.scale;
        this.realHeight = this.height * config.scale;
        this.realWidthLeft = this.widthLeft * config.scale;
        this.realWidthRight = this.widthRight * config.scale;
        this.realHeightTop = this.heightTop * config.scale;
        this.realHeightBottom = this.heightBottom * config.scale;
    }

    getDefaultWidth() {
        const widths = { road: 200, parking: 150, car: 30, bus: 40, bench: 20, lamp: 10, trash: 10, sign: 10, tree: 30 };
        return widths[this.subtype] || config.defaultObjectSize.width;
    }

    getDefaultHeight() {
        const heights = { road: 40, parking: 100, car: 20, bus: 25, bench: 15, lamp: 10, trash: 10, sign: 10, tree: 30 };
        return heights[this.subtype] || config.defaultObjectSize.height;
    }

    getDefaultColor() {
        const colors = { building: '#8B4513', transport: '#696969', nature: '#228B22', furniture: '#4682B4', zone: '#FFD700' };
        if (this.subtype === 'road') return '#404040';
        if (this.subtype === 'parking') return '#606060';
        if (this.subtype === 'sidewalk') return '#D3D3D3';
        return colors[this.type] || '#808080';
    }

    getDefaultName() {
        const names = {
            shop: 'Magasin', office: 'Bureau', warehouse: 'Entrepôt', restaurant: 'Restaurant',
            parking: 'Parking', road: 'Route', car: 'Voiture', bus: 'Bus',
            tree: 'Arbre', park: 'Parc', garden: 'Jardin', water: 'Plan d\'eau',
            bench: 'Banc', lamp: 'Lampadaire', trash: 'Poubelle', sign: 'Panneau',
            pedestrian: 'Zone piétonne', sidewalk: 'Trottoir', plaza: 'Place', loading: 'Zone de livraison'
        };
        return names[this.subtype] || 'Objet';
    }

    draw(ctx) {
        if (!this.visible) return;
        ctx.save();
        ctx.scale(config.zoom, config.zoom);
        
        // L'objet est positionné par son coin supérieur gauche (x, y)
        // On translate au point de référence pour le dessin
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.selected ? '#3498db' : '#000';
        ctx.lineWidth = this.selected ? 3 : 1;
        
        if (this.type === 'nature' && this.subtype === 'tree') {
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(this.widthLeft, this.widthRight), 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        } else {
            // Interpréter les dimensions comme :
            // widthLeft = largeur du haut du trapèze
            // widthRight = largeur du bas du trapèze
            // heightTop = longueur du côté gauche
            // heightBottom = longueur du côté droit
            
            ctx.beginPath();
            // Trapèze avec largeur et hauteur variables
            ctx.moveTo(0, 0); // Coin supérieur gauche
            ctx.lineTo(this.widthLeft, 0); // Coin supérieur droit (largeur du haut)
            ctx.lineTo(this.widthRight, this.heightBottom); // Coin inférieur droit (largeur du bas, longueur droite)
            ctx.lineTo(0, this.heightTop); // Coin inférieur gauche (longueur gauche)
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        
        ctx.fillStyle = this.getTextColor();
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Calculer le centre géométrique du quadrilatère
        const centerX = (0 + this.widthLeft + this.widthRight + 0) / 4;
        const centerY = (0 + 0 + this.heightBottom + this.heightTop) / 4;
        
        ctx.fillText(this.name, centerX, centerY);
        
        if (this.selected) {
            ctx.fillStyle = '#2c3e50';
            ctx.font = '10px Arial';
            const totalWidth = this.realWidthLeft + this.realWidthRight;
            const totalHeight = this.realHeightTop + this.realHeightBottom;
            ctx.fillText(`${totalWidth.toFixed(1)}m × ${totalHeight.toFixed(1)}m`, 0, Math.max(this.heightBottom, this.heightTop) + 15);
            
            if (this.type === 'building' || this.type === 'zone' || (this.type === 'transport' && this.subtype === 'parking')) {
                const area = this.getArea().toFixed(1);
                ctx.fillText(`Surface: ${area} m²`, 0, Math.max(this.heightBottom, this.heightTop) + 30);
            }
            
            // Dessiner les poignées de redimensionnement
            this.drawResizeHandles(ctx);
        }
        
        ctx.restore();
    }

    drawResizeHandles(ctx) {
        // Dessiner les poignées de redimensionnement
        const handleSize = 8 / config.zoom; // Taille fixe indépendante du zoom
        const vertices = this.getVertices();
        
        ctx.fillStyle = '#3498db';
        ctx.strokeStyle = '#2980b9';
        ctx.lineWidth = 1 / config.zoom;
        
        // Dessiner des poignées sur chaque coin
        vertices.forEach(vertex => {
            ctx.fillRect(vertex.x - handleSize/2, vertex.y - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(vertex.x - handleSize/2, vertex.y - handleSize/2, handleSize, handleSize);
        });
        
        // Dessiner des poignées au milieu de chaque côté pour redimensionner
        const midHandles = [
            { x: this.widthLeft / 2, y: 0, type: 'top' }, // Milieu haut
            { x: this.widthRight, y: this.heightBottom / 2, type: 'right' }, // Milieu droit
            { x: this.widthRight / 2, y: Math.max(this.heightTop, this.heightBottom), type: 'bottom' }, // Milieu bas
            { x: 0, y: this.heightTop / 2, type: 'left' } // Milieu gauche
        ];
        
        ctx.fillStyle = '#e74c3c';
        midHandles.forEach(handle => {
            ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
        });
    }

    getVertices() {
        return [
            {x: 0, y: 0, type: 'top-left'},
            {x: this.widthLeft, y: 0, type: 'top-right'},
            {x: this.widthRight, y: this.heightBottom, type: 'bottom-right'},
            {x: 0, y: this.heightTop, type: 'bottom-left'}
        ];
    }

    getResizeHandle(x, y) {
        if (!this.selected) return null;
        
        const localX = x - this.x;
        const localY = y - this.y;
        const handleSize = 8 / config.zoom;
        const tolerance = handleSize;
        
        // Vérifier les poignées de coin
        const vertices = this.getVertices();
        for (let vertex of vertices) {
            if (Math.abs(localX - vertex.x) <= tolerance && 
                Math.abs(localY - vertex.y) <= tolerance) {
                return vertex.type;
            }
        }
        
        // Vérifier les poignées de côté
        const midHandles = [
            { x: this.widthLeft / 2, y: 0, type: 'top' },
            { x: this.widthRight, y: this.heightBottom / 2, type: 'right' },
            { x: this.widthRight / 2, y: Math.max(this.heightTop, this.heightBottom), type: 'bottom' },
            { x: 0, y: this.heightTop / 2, type: 'left' }
        ];
        
        for (let handle of midHandles) {
            if (Math.abs(localX - handle.x) <= tolerance && 
                Math.abs(localY - handle.y) <= tolerance) {
                return handle.type;
            }
        }
        
        return null;
    }

    getTextColor() {
        const hex = this.color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 125 ? '#000' : '#fff';
    }

    isPointInside(x, y) {
        // Transformer le point en coordonnées locales
        const localX = x - this.x;
        const localY = y - this.y;
        
        // Pour un quadrilatère irrégulier, on doit vérifier si le point est à l'intérieur
        // en utilisant l'algorithme du point dans un polygone
        const vertices = [
            {x: 0, y: 0},
            {x: this.widthLeft, y: 0},
            {x: this.widthRight, y: this.heightBottom},
            {x: 0, y: this.heightTop}
        ];
        
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            
            const intersect = ((yi > localY) != (yj > localY))
                && (localX < (xj - xi) * (localY - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        
        return inside;
    }

    getArea() {
        // Formule pour l'aire d'un trapèze : ((base1 + base2) / 2) × hauteur
        const totalWidth = this.realWidthLeft + this.realWidthRight;
        const totalHeight = this.realHeightTop + this.realHeightBottom;
        return totalWidth * totalHeight;
    }
}

// Gestion du drag & drop
document.querySelectorAll('.draggable-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('type', item.dataset.type);
        e.dataTransfer.setData('subtype', item.dataset.subtype);
    });
});

canvas.addEventListener('dragover', (e) => e.preventDefault());

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / config.zoom;
    const y = (e.clientY - rect.top) / config.zoom;
    const type = e.dataTransfer.getData('type');
    const subtype = e.dataTransfer.getData('subtype');
    
    if (config.snapToGrid) {
        const snappedX = Math.round(x / config.gridSize) * config.gridSize;
        const snappedY = Math.round(y / config.gridSize) * config.gridSize;
        addObject(snappedX, snappedY, type, subtype);
    } else {
        addObject(x, y, type, subtype);
    }
});

// Gestion des clics
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / config.zoom;
    const y = (e.clientY - rect.top) / config.zoom;
    
    if (appState.mode === 'select') {
        // Vérifier d'abord si on clique sur une poignée de redimensionnement
        let resizeHandle = null;
        if (appState.selectedObject) {
            resizeHandle = appState.selectedObject.getResizeHandle(x, y);
        }
        
        if (resizeHandle) {
            // Mode redimensionnement
            appState.resizing = true;
            appState.resizeHandle = resizeHandle;
            appState.dragStart = { x, y };
            appState.originalDimensions = {
                widthLeft: appState.selectedObject.widthLeft,
                widthRight: appState.selectedObject.widthRight,
                heightTop: appState.selectedObject.heightTop,
                heightBottom: appState.selectedObject.heightBottom,
                x: appState.selectedObject.x,
                y: appState.selectedObject.y
            };
        } else {
            // Vérifier si on clique sur l'objet déjà sélectionné
            const clickedOnSelected = appState.selectedObject && 
                                     appState.selectedObject.isPointInside(x, y);
            
            if (!clickedOnSelected) {
                // Seulement changer la sélection si on ne clique pas sur l'objet sélectionné
                selectObjectAt(x, y);
            }
            
            if (appState.selectedObject) {
                appState.isDragging = true;
                appState.dragStart = { x: x - appState.selectedObject.x, y: y - appState.selectedObject.y };
            }
        }
    } else if (appState.mode === 'pan') {
        appState.isDragging = true;
        appState.dragStart = { x: e.clientX, y: e.clientY };
    }
});

// Gestion du double-clic pour sélectionner l'objet en dessous
canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / config.zoom;
    const y = (e.clientY - rect.top) / config.zoom;
    
    if (appState.mode === 'select' && appState.selectedObject && 
        appState.selectedObject.isPointInside(x, y)) {
        // Forcer la sélection de l'objet suivant en dessous
        selectObjectAt(x, y);
        updatePropertiesPanel();
        render();
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / config.zoom;
    const y = (e.clientY - rect.top) / config.zoom;
    
    // Gérer le curseur selon le contexte
    if (!appState.resizing && !appState.isDragging && appState.selectedObject) {
        const resizeHandle = appState.selectedObject.getResizeHandle(x, y);
        if (resizeHandle) {
            switch (resizeHandle) {
                case 'top-left':
                case 'bottom-right':
                    canvas.style.cursor = 'nw-resize';
                    break;
                case 'top-right':
                case 'bottom-left':
                    canvas.style.cursor = 'ne-resize';
                    break;
                case 'top':
                case 'bottom':
                    canvas.style.cursor = 'ns-resize';
                    break;
                case 'left':
                case 'right':
                    canvas.style.cursor = 'ew-resize';
                    break;
            }
        } else if (appState.selectedObject.isPointInside(x, y)) {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'default';
        }
    } else if (!appState.resizing && !appState.isDragging) {
        canvas.style.cursor = 'default';
    }
    
    if (appState.resizing && appState.selectedObject) {
        // Mode redimensionnement
        const deltaX = x - appState.dragStart.x;
        const deltaY = y - appState.dragStart.y;
        const obj = appState.selectedObject;
        const orig = appState.originalDimensions;
        
        switch (appState.resizeHandle) {
            case 'top-left':
                obj.widthLeft = Math.max(10, orig.widthLeft - deltaX);
                obj.heightTop = Math.max(10, orig.heightTop - deltaY);
                obj.x = orig.x + deltaX;
                obj.y = orig.y + deltaY;
                break;
            case 'top-right':
                obj.widthLeft = Math.max(10, orig.widthLeft + deltaX);
                obj.heightTop = Math.max(10, orig.heightTop - deltaY);
                obj.y = orig.y + deltaY;
                break;
            case 'bottom-right':
                obj.widthRight = Math.max(10, orig.widthRight + deltaX);
                obj.heightBottom = Math.max(10, orig.heightBottom + deltaY);
                break;
            case 'bottom-left':
                obj.widthLeft = Math.max(10, orig.widthLeft - deltaX);
                obj.heightBottom = Math.max(10, orig.heightBottom + deltaY);
                obj.x = orig.x + deltaX;
                break;
            case 'top':
                obj.heightTop = Math.max(10, orig.heightTop - deltaY);
                obj.y = orig.y + deltaY;
                break;
            case 'bottom':
                obj.heightBottom = Math.max(10, orig.heightBottom + deltaY);
                break;
            case 'left':
                obj.widthLeft = Math.max(10, orig.widthLeft - deltaX);
                obj.x = orig.x + deltaX;
                break;
            case 'right':
                obj.widthRight = Math.max(10, orig.widthRight + deltaX);
                break;
        }
        
        // Mettre à jour les dimensions réelles
        obj.width = obj.widthLeft + obj.widthRight;
        obj.height = obj.heightTop + obj.heightBottom;
        obj.realWidth = obj.width * config.scale;
        obj.realHeight = obj.height * config.scale;
        obj.realWidthLeft = obj.widthLeft * config.scale;
        obj.realWidthRight = obj.widthRight * config.scale;
        obj.realHeightTop = obj.heightTop * config.scale;
        obj.realHeightBottom = obj.heightBottom * config.scale;
        
        updatePropertiesPanel();
        render();
        
    } else if (appState.isDragging && appState.mode === 'select' && appState.selectedObject) {
        // Mode déplacement
        appState.selectedObject.x = x - appState.dragStart.x;
        appState.selectedObject.y = y - appState.dragStart.y;
        
        if (config.snapToGrid) {
            appState.selectedObject.x = Math.round(appState.selectedObject.x / config.gridSize) * config.gridSize;
            appState.selectedObject.y = Math.round(appState.selectedObject.y / config.gridSize) * config.gridSize;
        }
        
        updatePropertiesPanel();
        render();
    } else if (appState.mode === 'pan') {
        const dx = e.clientX - appState.dragStart.x;
        const dy = e.clientY - appState.dragStart.y;
        appState.canvasOffset.x += dx;
        appState.canvasOffset.y += dy;
        appState.dragStart = { x: e.clientX, y: e.clientY };
        render();
    }
});

canvas.addEventListener('mouseup', () => {
    appState.isDragging = false;
    appState.resizing = false;
    appState.resizeHandle = null;
    appState.originalDimensions = null;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    config.zoom = Math.max(config.minZoom, Math.min(config.maxZoom, config.zoom + delta));
    updateZoomDisplay();
    render();
});

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && appState.selectedObject) deleteSelected();
    else if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveProject(); }
    else if (e.ctrlKey && e.key === 'o') { e.preventDefault(); loadProject(); }
    else if (e.key === 'g') toggleGrid();
});

// Fonctions principales
function addObject(x, y, type, subtype) {
    const obj = new PlanObject(x, y, type, subtype);
    appState.objects.push(obj);
    appState.selectedObject = obj;
    updatePropertiesPanel();
    updateStats();
    render();
}

function selectObjectAt(x, y) {
    appState.selectedObject = null;
    const sortedObjects = [...appState.objects].sort((a, b) => b.zIndex - a.zIndex);
    
    for (let obj of sortedObjects) {
        if (obj.isPointInside(x, y) && obj.visible && !obj.locked) {
            if (obj.selected && sortedObjects.length > 1) {
                const currentIndex = sortedObjects.indexOf(obj);
                for (let i = currentIndex + 1; i < sortedObjects.length; i++) {
                    const nextObj = sortedObjects[i];
                    if (nextObj.isPointInside(x, y) && nextObj.visible && !nextObj.locked) {
                        appState.selectedObject = nextObj;
                        nextObj.selected = true;
                        obj.selected = false;
                        break;
                    }
                }
                if (!appState.selectedObject) appState.selectedObject = obj;
            } else {
                appState.selectedObject = obj;
                obj.selected = true;
            }
            break;
        }
    }
    
    appState.objects.forEach(obj => {
        if (obj !== appState.selectedObject) obj.selected = false;
    });
    
    updatePropertiesPanel();
    render();
}

function bringToFront() {
    if (!appState.selectedObject) return;
    appState.selectedObject.zIndex = Date.now();
    render();
}

function sendToBack() {
    if (!appState.selectedObject) return;
    const minZIndex = Math.min(...appState.objects.map(obj => obj.zIndex));
    appState.selectedObject.zIndex = minZIndex - 1;
    render();
}

function deleteSelected() {
    if (!appState.selectedObject) return;
    const index = appState.objects.indexOf(appState.selectedObject);
    if (index > -1) {
        appState.objects.splice(index, 1);
        appState.selectedObject = null;
        updatePropertiesPanel();
        updateStats();
        render();
    }
}

function duplicateSelected() {
    if (!appState.selectedObject) return;
    const original = appState.selectedObject;
    const copy = new PlanObject(original.x + 20, original.y + 20, original.type, original.subtype);
    
    copy.width = original.width;
    copy.height = original.height;
    copy.widthLeft = original.widthLeft;
    copy.widthRight = original.widthRight;
    copy.heightTop = original.heightTop;
    copy.heightBottom = original.heightBottom;
    copy.rotation = original.rotation;
    copy.color = original.color;
    copy.name = original.name + ' (copie)';
    copy.realWidth = original.realWidth;
    copy.realHeight = original.realHeight;
    copy.realWidthLeft = original.realWidthLeft;
    copy.realWidthRight = original.realWidthRight;
    copy.realHeightTop = original.realHeightTop;
    copy.realHeightBottom = original.realHeightBottom;
    copy.layer = original.layer;
    
    appState.objects.push(copy);
    appState.selectedObject = copy;
    copy.selected = true;
    original.selected = false;
    
    updatePropertiesPanel();
    updateStats();
    render();
}

function updatePropertiesPanel() {
    const panel = document.getElementById('propertiesPanel');
    
    if (!appState.selectedObject) {
        panel.innerHTML = '<div class="no-selection">Sélectionnez un objet pour modifier ses propriétés</div>';
        return;
    }
    
    const obj = appState.selectedObject;
    panel.innerHTML = `
        <div class="property-group">
            <h3>Général</h3>
            <div class="property-row">
                <label class="property-label">Nom:</label>
                <input type="text" class="property-input" value="${obj.name}" onchange="updateObjectProperty('name', this.value)">
            </div>
        </div>
        <div class="property-group">
            <h3>Dimensions (mètres)</h3>
            <div class="property-row">
                <label class="property-label">Largeur haut:</label>
                <input type="number" class="property-input" value="${obj.realWidthLeft.toFixed(1)}" step="0.1" min="0.1" onchange="updateObjectDimension('widthLeft', this.value)">
            </div>
            <div class="property-row">
                <label class="property-label">Largeur bas:</label>
                <input type="number" class="property-input" value="${obj.realWidthRight.toFixed(1)}" step="0.1" min="0.1" onchange="updateObjectDimension('widthRight', this.value)">
            </div>
            <div class="property-row">
                <label class="property-label">Longueur gauche:</label>
                <input type="number" class="property-input" value="${obj.realHeightTop.toFixed(1)}" step="0.1" min="0.1" onchange="updateObjectDimension('heightTop', this.value)">
            </div>
            <div class="property-row">
                <label class="property-label">Longueur droite:</label>
                <input type="number" class="property-input" value="${obj.realHeightBottom.toFixed(1)}" step="0.1" min="0.1" onchange="updateObjectDimension('heightBottom', this.value)">
            </div>
        </div>
        <div class="property-group">
            <h3>Apparence</h3>
            <div class="property-row">
                <label class="property-label">Couleur:</label>
                <input type="color" class="property-input" value="${obj.color}" onchange="updateObjectProperty('color', this.value)">
            </div>
            <div class="property-row">
                <label class="property-label">Rotation:</label>
                <input type="range" class="property-input" value="${obj.rotation}" min="0" max="360" onchange="updateObjectProperty('rotation', parseFloat(this.value))" style="flex: 1;">
                <span style="margin-left: 10px; min-width: 40px; text-align: right; font-weight: 500;">${obj.rotation}°</span>
            </div>
        </div>
    `;
}

function updateObjectProperty(property, value) {
    if (!appState.selectedObject) return;
    appState.selectedObject[property] = value;
    updateStats();
    render();
}

function updateObjectDimension(dimension, value) {
    if (!appState.selectedObject) return;
    const realValue = parseFloat(value);
    const obj = appState.selectedObject;
    
    switch(dimension) {
        case 'widthLeft':
            obj.realWidthLeft = realValue;
            obj.widthLeft = realValue / config.scale;
            obj.width = obj.widthLeft + obj.widthRight;
            obj.realWidth = obj.width * config.scale;
            break;
        case 'widthRight':
            obj.realWidthRight = realValue;
            obj.widthRight = realValue / config.scale;
            obj.width = obj.widthLeft + obj.widthRight;
            obj.realWidth = obj.width * config.scale;
            break;
        case 'heightTop':
            obj.realHeightTop = realValue;
            obj.heightTop = realValue / config.scale;
            obj.height = obj.heightTop + obj.heightBottom;
            obj.realHeight = obj.height * config.scale;
            break;
        case 'heightBottom':
            obj.realHeightBottom = realValue;
            obj.heightBottom = realValue / config.scale;
            obj.height = obj.heightTop + obj.heightBottom;
            obj.realHeight = obj.height * config.scale;
            break;
        case 'width':
            obj.realWidth = realValue;
            obj.width = realValue / config.scale;
            obj.widthLeft = obj.width / 2;
            obj.widthRight = obj.width / 2;
            obj.realWidthLeft = obj.widthLeft * config.scale;
            obj.realWidthRight = obj.widthRight * config.scale;
            break;
        case 'height':
            obj.realHeight = realValue;
            obj.height = realValue / config.scale;
            obj.heightTop = obj.height / 2;
            obj.heightBottom = obj.height / 2;
            obj.realHeightTop = obj.heightTop * config.scale;
            obj.realHeightBottom = obj.heightBottom * config.scale;
            break;
    }
    updatePropertiesPanel();
    updateStats();
    render();
}

function updateStats() {
    let totalObjects = appState.objects.length;
    let buildingArea = 0, parkingArea = 0, greenArea = 0;
    
    appState.objects.forEach(obj => {
        if (obj.type === 'building') buildingArea += obj.getArea();
        else if (obj.type === 'transport' && obj.subtype === 'parking') parkingArea += obj.getArea();
        else if (obj.type === 'nature') greenArea += obj.getArea();
    });
    
    document.getElementById('totalObjects').textContent = totalObjects;
    document.getElementById('totalBuildingArea').textContent = buildingArea.toFixed(1) + ' m²';
    document.getElementById('totalParkingArea').textContent = parkingArea.toFixed(1) + ' m²';
    document.getElementById('totalGreenArea').textContent = greenArea.toFixed(1) + ' m²';
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(appState.canvasOffset.x, appState.canvasOffset.y);
    
    if (appState.showGrid) drawGrid();
    
    const sortedObjects = [...appState.objects].sort((a, b) => a.zIndex - b.zIndex);
    appState.layers.forEach(layer => {
        if (!layer.visible) return;
        sortedObjects.filter(obj => obj.layer === layer.id).forEach(obj => obj.draw(ctx));
    });
    
    ctx.restore();
}

function drawGrid() {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    const gridStep = config.gridSize * config.zoom;
    const startX = -appState.canvasOffset.x % gridStep;
    const startY = -appState.canvasOffset.y % gridStep;
    
    for (let x = startX; x < canvas.width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let y = startY; y < canvas.height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function setMode(mode) {
    appState.mode = mode;
    canvas.style.cursor = mode === 'pan' ? 'grab' : 'default';
}

function toggleGrid() {
    appState.showGrid = document.getElementById('gridToggle').checked;
    render();
}

function showLayersModal() {
    document.getElementById('layersModal').classList.add('active');
    updateLayersList();
}

function closeLayersModal() {
    document.getElementById('layersModal').classList.remove('active');
}

function updateLayersList() {
    const list = document.getElementById('layersList');
    list.innerHTML = appState.layers.map(layer => `
        <li style="display: flex; align-items: center; padding: 10px; background: #f8f9fa; margin-bottom: 8px; border-radius: 6px;">
            <input type="checkbox" ${layer.visible ? 'checked' : ''} onclick="toggleLayerVisibility(${layer.id}, event)" style="margin-right: 10px;">
            <span style="flex: 1;">${layer.name}</span>
        </li>
    `).join('');
}

function addLayer() {
    const newLayer = { id: Date.now(), name: `Calque ${appState.layers.length + 1}`, visible: true, locked: false };
    appState.layers.push(newLayer);
    updateLayersList();
}

function toggleLayerVisibility(layerId, event) {
    event.stopPropagation();
    const layer = appState.layers.find(l => l.id === layerId);
    if (layer) {
        layer.visible = !layer.visible;
        render();
    }
}

function zoomIn() {
    config.zoom = Math.min(config.maxZoom, config.zoom + 0.25);
    updateZoomDisplay();
    render();
}

function zoomOut() {
    config.zoom = Math.max(config.minZoom, config.zoom - 0.25);
    updateZoomDisplay();
    render();
}

function resetZoom() {
    config.zoom = 1;
    appState.canvasOffset = { x: 0, y: 0 };
    updateZoomDisplay();
    render();
}

function updateZoomDisplay() {
    document.querySelector('.zoom-level').textContent = Math.round(config.zoom * 100) + '%';
}

function saveProject() {
    const projectData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        config: config,
        objects: appState.objects,
        layers: appState.layers,
        currentLayer: appState.currentLayer
    };
    
    const dataStr = JSON.stringify(projectData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `plan_${new Date().toISOString().slice(0,10)}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = event => {
            try {
                const projectData = JSON.parse(event.target.result);
                Object.assign(config, projectData.config);
                appState.objects = projectData.objects.map(objData => {
                    const obj = Object.create(PlanObject.prototype);
                    Object.assign(obj, objData);
                    // Assurer la compatibilité avec les anciens fichiers
                    if (obj.widthLeft === undefined) {
                        obj.widthLeft = obj.width / 2;
                        obj.widthRight = obj.width / 2;
                        obj.heightTop = obj.height / 2;
                        obj.heightBottom = obj.height / 2;
                        obj.realWidthLeft = obj.widthLeft * config.scale;
                        obj.realWidthRight = obj.widthRight * config.scale;
                        obj.realHeightTop = obj.heightTop * config.scale;
                        obj.realHeightBottom = obj.heightBottom * config.scale;
                    }
                    return obj;
                });
                appState.layers = projectData.layers;
                appState.currentLayer = projectData.currentLayer;
                updateStats();
                render();
                alert('Projet chargé avec succès !');
            } catch (error) {
                alert('Erreur lors du chargement du fichier');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

function exportImage() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    
    tempCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `plan_${new Date().toISOString().slice(0,10)}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    });
}

function showHelpModal() {
    document.getElementById('helpModal').classList.add('active');
}

function closeHelpModal() {
    document.getElementById('helpModal').classList.remove('active');
}

function toggleCategory(header) {
    const items = header.nextElementSibling;
    const arrow = header.querySelector('span:last-child');
    
    if (items.style.display === 'none') {
        items.style.display = 'grid';
        arrow.textContent = '▼';
    } else {
        items.style.display = 'none';
        arrow.textContent = '▶';
    }
}

// Initialisation
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updateStats();

console.log('🎉 PlannerPro chargé avec succès !');
console.log('📖 Appuyez sur ? pour afficher l\'aide');