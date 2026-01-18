/**
 * Notes Module - Clean Document-Style Editor
 * Single continuous view for parent section and subsections
 */

// Notes state
const notesState = {
    sections: [],           // Hierarchical section tree
    flatSections: [],       // Flat list for quick lookup
    selectedSection: null,
    selectedSectionId: null,
    quillEditors: {},       // Map of section ID to Quill instance
    saveTimeouts: {},       // Map of section ID to save timeout
    expandedSections: new Set(),  // Track expanded sections in sidebar
    activeEditor: null      // Currently focused editor
};

// Quill formats allowed
const QUILL_FORMATS = ['bold', 'italic', 'underline', 'list', 'bullet'];

// ========================================
// Section Loading & Tree Building
// ========================================

async function loadSections() {
    try {
        const sections = await api('/api/notes/');
        notesState.sections = sections;
        notesState.flatSections = flattenSections(sections);
        renderSectionTree();
        updateSectionSelects();
    } catch (error) {
        console.error('Failed to load sections:', error);
        showToast('Failed to load sections', 'error');
    }
}

function flattenSections(sections, flat = []) {
    for (const section of sections) {
        flat.push(section);
        if (section.children && section.children.length > 0) {
            flattenSections(section.children, flat);
        }
    }
    return flat;
}

function findSectionById(id) {
    return notesState.flatSections.find(s => s.id === id);
}

// ========================================
// Section Tree Rendering (Sidebar)
// ========================================

function renderSectionTree() {
    const container = document.getElementById('sections-list-content');

    if (notesState.sections.length === 0) {
        container.innerHTML = `
            <div class="empty-list">
                <p>No sections yet</p>
                <p>Create your first section to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notesState.sections.map(section =>
        renderSectionTreeItem(section, false)
    ).join('');

    attachTreeEventListeners();
}

function renderSectionTreeItem(section, isChild = false) {
    const hasChildren = section.children && section.children.length > 0;
    const isExpanded = notesState.expandedSections.has(section.id);
    const isActive = notesState.selectedSectionId === section.id;

    let html = `
        <div class="section-tree-item ${isChild ? '' : 'parent-section'}" data-section-id="${section.id}">
            <div class="section-item-row ${isActive ? 'active' : ''}" data-section-id="${section.id}">
    `;

    if (hasChildren) {
        html += `<button class="section-expand-btn ${isExpanded ? 'expanded' : ''}" data-section-id="${section.id}">▶</button>`;
    } else if (!isChild) {
        html += `<span class="section-expand-placeholder"></span>`;
    }

    html += `
                <div class="section-item-content">
                    <div class="section-item-title">${escapeHtml(section.title)}</div>
                    <div class="section-item-preview">${getPreview(section.content)}</div>
                </div>
    `;

    if (hasChildren) {
        html += `<span class="subsection-indicator">${section.children.length}</span>`;
    }

    html += `</div>`;

    if (hasChildren) {
        html += `
            <div class="section-children ${isExpanded ? '' : 'collapsed'}">
                ${section.children.map(child => renderSectionTreeItem(child, true)).join('')}
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

function getPreview(content) {
    if (!content) return 'No content';
    const text = content.replace(/<[^>]*>/g, '').trim();
    return text.length > 40 ? text.substring(0, 40) + '...' : text || 'No content';
}

function attachTreeEventListeners() {
    document.querySelectorAll('.section-expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sectionId = parseInt(btn.dataset.sectionId);
            toggleSectionExpand(sectionId);
        });
    });

    document.querySelectorAll('.section-item-row').forEach(row => {
        row.addEventListener('click', () => {
            const sectionId = parseInt(row.dataset.sectionId);
            selectSection(sectionId);
        });
    });
}

function toggleSectionExpand(sectionId) {
    if (notesState.expandedSections.has(sectionId)) {
        notesState.expandedSections.delete(sectionId);
    } else {
        notesState.expandedSections.add(sectionId);
    }
    renderSectionTree();
}

// ========================================
// Section Selection & Document-Style Editor
// ========================================

function selectSection(sectionId) {
    let section = findSectionById(sectionId);
    if (!section) return;

    // If subsection, select parent instead
    if (section.parent_id !== null) {
        const parent = findSectionById(section.parent_id);
        if (parent) {
            section = parent;
            sectionId = parent.id;
        }
    }

    notesState.selectedSection = section;
    notesState.selectedSectionId = sectionId;
    notesState.expandedSections.add(sectionId);

    document.getElementById('editor-placeholder').classList.add('hidden');
    document.getElementById('editor-active').classList.remove('hidden');
    document.getElementById('section-title').value = section.title;

    renderDocumentEditor(section);
    document.getElementById('save-status').textContent = 'All changes saved';
    renderSectionTree();
}

function renderDocumentEditor(parentSection) {
    destroyAllEditors();

    const container = document.getElementById('document-content');
    container.innerHTML = '';

    // Main section content
    const mainDiv = document.createElement('div');
    mainDiv.className = 'doc-section doc-main';
    mainDiv.id = 'doc-main-section';
    mainDiv.dataset.sectionId = parentSection.id;
    mainDiv.innerHTML = `
        <div class="doc-section-label">Main Content</div>
        <div class="doc-editor" id="doc-editor-main"></div>
    `;
    container.appendChild(mainDiv);

    // Initialize main editor
    const mainEditor = new Quill('#doc-editor-main', {
        theme: 'snow',
        placeholder: 'Start writing your notes...',
        modules: { toolbar: '#shared-toolbar' },
        formats: QUILL_FORMATS
    });
    mainEditor.root.innerHTML = parentSection.content || '';
    notesState.quillEditors[parentSection.id] = mainEditor;

    mainEditor.on('selection-change', (range) => {
        if (range) notesState.activeEditor = mainEditor;
    });
    mainEditor.on('text-change', () => {
        debounceSaveSection(parentSection.id);
    });

    // Subsections
    if (parentSection.children && parentSection.children.length > 0) {
        for (const subsection of parentSection.children) {
            const subDiv = document.createElement('div');
            subDiv.className = 'doc-section doc-subsection';
            subDiv.id = `doc-subsection-${subsection.id}`;
            subDiv.dataset.sectionId = subsection.id;
            subDiv.innerHTML = `
                <div class="doc-subsection-header">
                    <input type="text" class="doc-subsection-title" 
                           id="doc-title-${subsection.id}"
                           value="${escapeHtml(subsection.title)}"
                           placeholder="Subsection Title">
                    <button class="doc-delete-btn" data-id="${subsection.id}" title="Delete">×</button>
                </div>
                <div class="doc-editor" id="doc-editor-${subsection.id}"></div>
            `;
            container.appendChild(subDiv);

            // Initialize subsection editor
            const subEditor = new Quill(`#doc-editor-${subsection.id}`, {
                theme: 'snow',
                placeholder: 'Write content...',
                modules: { toolbar: '#shared-toolbar' },
                formats: QUILL_FORMATS
            });
            subEditor.root.innerHTML = subsection.content || '';
            notesState.quillEditors[subsection.id] = subEditor;

            subEditor.on('selection-change', (range) => {
                if (range) notesState.activeEditor = subEditor;
            });
            subEditor.on('text-change', () => {
                debounceSaveSection(subsection.id);
            });

            // Title change listener
            const titleInput = subDiv.querySelector('.doc-subsection-title');
            titleInput.addEventListener('input', () => {
                debounceSaveSection(subsection.id);
            });

            // Delete button listener
            const deleteBtn = subDiv.querySelector('.doc-delete-btn');
            deleteBtn.addEventListener('click', () => {
                handleDeleteSubsection(subsection.id, subsection.title);
            });
        }
    }

    // Add subsection button
    const addBtn = document.createElement('div');
    addBtn.className = 'doc-add-subsection';
    addBtn.innerHTML = `<button class="btn btn-ghost" id="doc-add-btn">+ Add Subsection</button>`;
    container.appendChild(addBtn);

    document.getElementById('doc-add-btn').addEventListener('click', addSubsectionInline);
    notesState.activeEditor = mainEditor;
}

function destroyAllEditors() {
    notesState.quillEditors = {};
    notesState.activeEditor = null;

    const container = document.getElementById('document-content');
    if (container) container.innerHTML = '';
}

// ========================================
// Auto-Save Logic
// ========================================

function debounceSaveSection(sectionId) {
    document.getElementById('save-status').textContent = 'Saving...';

    if (notesState.saveTimeouts[sectionId]) {
        clearTimeout(notesState.saveTimeouts[sectionId]);
    }

    notesState.saveTimeouts[sectionId] = setTimeout(() => {
        saveSection(sectionId);
    }, 1500);
}

async function saveSection(sectionId) {
    const editor = notesState.quillEditors[sectionId];
    if (!editor) return;

    const section = findSectionById(sectionId);
    if (!section) return;

    let title;
    if (section.parent_id === null) {
        title = document.getElementById('section-title').value.trim();
    } else {
        const titleInput = document.getElementById(`doc-title-${sectionId}`);
        title = titleInput ? titleInput.value.trim() : section.title;
    }

    const content = editor.root.innerHTML;

    if (!title) {
        document.getElementById('save-status').textContent = 'Title required';
        return;
    }

    try {
        await api(`/api/notes/${sectionId}`, {
            method: 'PUT',
            body: { title, content }
        });

        section.title = title;
        section.content = content;
        document.getElementById('save-status').textContent = 'All changes saved';
        renderSectionTree();
    } catch (error) {
        document.getElementById('save-status').textContent = 'Save failed';
        showToast(`Failed to save: ${error.message}`, 'error');
    }
}

// Save all pending changes immediately (cancels debounce timers)
async function saveAllPendingChanges() {
    // Cancel all pending debounce timers
    for (const sectionId of Object.keys(notesState.saveTimeouts)) {
        clearTimeout(notesState.saveTimeouts[sectionId]);
        delete notesState.saveTimeouts[sectionId];
    }

    // Save all editors currently in state
    const savePromises = [];
    for (const sectionId of Object.keys(notesState.quillEditors)) {
        savePromises.push(saveSection(parseInt(sectionId)));
    }

    await Promise.all(savePromises);
}

// ========================================
// CRUD Operations
// ========================================

async function createSection(parentId = null) {
    try {
        // IMPORTANT: Save all pending changes before adding new subsection
        if (parentId) {
            await saveAllPendingChanges();
        }

        const section = await api('/api/notes/', {
            method: 'POST',
            body: {
                title: parentId ? 'New Subsection' : 'New Section',
                content: '',
                parent_id: parentId
            }
        });

        await loadSections();

        if (parentId) {
            selectSection(parentId);
            showToast('Subsection created', 'success');
        } else {
            selectSection(section.id);
            document.getElementById('section-title').focus();
            document.getElementById('section-title').select();
            showToast('Section created', 'success');
        }
    } catch (error) {
        showToast(`Failed to create section: ${error.message}`, 'error');
    }
}

async function deleteSection() {
    if (!notesState.selectedSectionId) return;

    const section = findSectionById(notesState.selectedSectionId);
    const hasChildren = section && section.children && section.children.length > 0;

    const message = hasChildren
        ? `Delete "${section.title}" and all its subsections?`
        : `Delete "${section?.title}"?`;

    const confirmed = await showConfirmDialog(message);
    if (!confirmed) return;

    try {
        await api(`/api/notes/${notesState.selectedSectionId}`, {
            method: 'DELETE'
        });

        notesState.selectedSection = null;
        notesState.selectedSectionId = null;
        destroyAllEditors();

        document.getElementById('editor-placeholder').classList.remove('hidden');
        document.getElementById('editor-active').classList.add('hidden');

        await loadSections();
        showToast('Section deleted', 'success');
    } catch (error) {
        showToast(`Failed to delete: ${error.message}`, 'error');
    }
}

// Custom confirmation function that doesn't rely on native confirm()
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary confirm-cancel">Cancel</button>
                    <button class="btn btn-danger confirm-delete">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Handle buttons
        overlay.querySelector('.confirm-cancel').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
        overlay.querySelector('.confirm-delete').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

async function handleDeleteSubsection(subsectionId, title) {
    console.log('handleDeleteSubsection called:', subsectionId, title);

    const confirmed = await showConfirmDialog(`Delete "${title}"?`);

    if (!confirmed) {
        console.log('Delete cancelled by user');
        return;
    }

    console.log('User confirmed delete, proceeding...');

    try {
        const response = await api(`/api/notes/${subsectionId}`, {
            method: 'DELETE'
        });
        console.log('Delete API response:', response);

        await loadSections();
        console.log('Sections reloaded');

        if (notesState.selectedSectionId) {
            const updatedParent = findSectionById(notesState.selectedSectionId);
            if (updatedParent) {
                notesState.selectedSection = updatedParent;
                renderDocumentEditor(updatedParent);
                console.log('Editor re-rendered');
            }
        }

        showToast('Subsection deleted', 'success');
    } catch (error) {
        console.error('Delete failed:', error);
        showToast(`Failed to delete: ${error.message}`, 'error');
    }
}

async function addSubsectionInline() {
    if (!notesState.selectedSectionId) return;
    await createSection(notesState.selectedSectionId);
}

// ========================================
// Section Checklists (for Quiz/Recall)
// ========================================

function updateSectionSelects() {
    renderSectionChecklist('quiz-section-checklist');
    renderSectionChecklist('recall-section-checklist');
}

function renderSectionChecklist(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (notesState.sections.length === 0) {
        container.innerHTML = `<div class="checklist-empty">No sections available</div>`;
        return;
    }

    let html = '';

    for (const section of notesState.sections) {
        html += `
            <div class="checklist-item parent-item">
                <input type="checkbox" id="${containerId}-${section.id}" value="${section.id}">
                <label for="${containerId}-${section.id}">${escapeHtml(section.title)}</label>
            </div>
        `;

        if (section.children && section.children.length > 0) {
            for (const child of section.children) {
                html += `
                    <div class="checklist-item indent-1">
                        <input type="checkbox" id="${containerId}-${child.id}" value="${child.id}">
                        <label for="${containerId}-${child.id}">${escapeHtml(child.title)}</label>
                    </div>
                `;
            }
        }
    }

    html += `
        <div class="checklist-actions">
            <button class="btn btn-secondary" onclick="selectAllChecklist('${containerId}')">Select All</button>
            <button class="btn btn-secondary" onclick="deselectAllChecklist('${containerId}')">Deselect All</button>
        </div>
    `;

    container.innerHTML = html;
}

function selectAllChecklist(containerId) {
    document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach(cb => {
        cb.checked = true;
    });
}

function deselectAllChecklist(containerId) {
    document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach(cb => {
        cb.checked = false;
    });
}

function getSelectedSectionIds(containerId) {
    const ids = [];
    document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`).forEach(cb => {
        ids.push(parseInt(cb.value));
    });
    return ids;
}

// ========================================
// Export/Import
// ========================================

async function exportAllNotes() {
    try {
        const response = await fetch('/api/notes/export/all');
        const data = await response.json();

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'notes_export.json';
        a.click();
        URL.revokeObjectURL(url);

        showToast('Notes exported successfully', 'success');
    } catch (error) {
        showToast(`Export failed: ${error.message}`, 'error');
    }
}

async function exportCurrentSection() {
    if (!notesState.selectedSectionId) return;

    try {
        const response = await fetch(`/api/notes/export/${notesState.selectedSectionId}`);
        const data = await response.json();

        const section = findSectionById(notesState.selectedSectionId);
        const filename = `notes_${section?.title.replace(/\s+/g, '_') || 'section'}.json`;

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Section exported successfully', 'success');
    } catch (error) {
        showToast(`Export failed: ${error.message}`, 'error');
    }
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    loadSections();

    document.getElementById('new-section-btn').addEventListener('click', () => createSection());

    document.getElementById('section-title').addEventListener('input', () => {
        if (notesState.selectedSectionId) {
            debounceSaveSection(notesState.selectedSectionId);
        }
    });

    document.getElementById('delete-section-btn').addEventListener('click', deleteSection);
    document.getElementById('export-all-btn').addEventListener('click', exportAllNotes);
    document.getElementById('export-section-btn').addEventListener('click', exportCurrentSection);
});

// Global exports
window.selectAllChecklist = selectAllChecklist;
window.deselectAllChecklist = deselectAllChecklist;
window.getSelectedSectionIds = getSelectedSectionIds;
window.loadSections = loadSections;
window.notesState = notesState;
window.selectSection = selectSection;
window.handleDeleteSubsection = handleDeleteSubsection;
