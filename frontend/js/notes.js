/**
 * Notes Module
 * Handles note sections CRUD operations
 */

// Current editing state
let saveTimeout = null;

// ========================================
// Section List Rendering
// ========================================

function renderSectionsList() {
    const container = document.getElementById('sections-list-content');

    if (state.sections.length === 0) {
        container.innerHTML = `
            <div class="empty-list">
                <p>No sections yet</p>
                <p>Create your first section to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.sections.map(section => `
        <div class="section-item ${state.currentSection?.id === section.id ? 'active' : ''}" 
             data-id="${section.id}">
            <div class="section-item-title">${escapeHtml(section.title) || 'Untitled'}</div>
            <div class="section-item-preview">${getPreview(section.content)}</div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.section-item').forEach(item => {
        item.addEventListener('click', () => selectSection(parseInt(item.dataset.id)));
    });
}

function getPreview(content) {
    if (!content) return 'Empty section';
    const text = content.replace(/\n/g, ' ').trim();
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Section Selection & Editing
// ========================================

function selectSection(sectionId) {
    const section = state.sections.find(s => s.id === sectionId);
    if (!section) return;

    state.currentSection = section;

    // Show editor
    document.getElementById('editor-placeholder').classList.add('hidden');
    document.getElementById('editor-active').classList.remove('hidden');

    // Populate editor
    document.getElementById('section-title').value = section.title;
    document.getElementById('notes-editor').value = section.content;
    document.getElementById('save-status').textContent = 'All changes saved';

    // Update section list
    renderSectionsList();
}

// ========================================
// CRUD Operations
// ========================================

async function createSection() {
    try {
        const newSection = await api('/api/notes/', {
            method: 'POST',
            body: { title: 'New Section', content: '' }
        });

        state.sections.unshift(newSection);
        selectSection(newSection.id);
        renderSectionsList();

        // Focus on title
        document.getElementById('section-title').focus();
        document.getElementById('section-title').select();

        showToast('Section created', 'success');
    } catch (error) {
        showToast(`Failed to create section: ${error.message}`, 'error');
    }
}

async function saveSection() {
    if (!state.currentSection) return;

    const title = document.getElementById('section-title').value.trim() || 'Untitled';
    const content = document.getElementById('notes-editor').value;

    try {
        document.getElementById('save-status').textContent = 'Saving...';

        const updated = await api(`/api/notes/${state.currentSection.id}`, {
            method: 'PUT',
            body: { title, content }
        });

        // Update state
        const index = state.sections.findIndex(s => s.id === state.currentSection.id);
        if (index !== -1) {
            state.sections[index] = updated;
        }
        state.currentSection = updated;

        document.getElementById('save-status').textContent = 'All changes saved';
        renderSectionsList();
    } catch (error) {
        document.getElementById('save-status').textContent = 'Save failed';
        showToast(`Failed to save: ${error.message}`, 'error');
    }
}

async function deleteSection() {
    if (!state.currentSection) return;

    const confirmed = confirm(`Are you sure you want to delete "${state.currentSection.title}"?`);
    if (!confirmed) return;

    try {
        await api(`/api/notes/${state.currentSection.id}`, {
            method: 'DELETE'
        });

        // Remove from state
        state.sections = state.sections.filter(s => s.id !== state.currentSection.id);
        state.currentSection = null;

        // Reset editor
        document.getElementById('editor-active').classList.add('hidden');
        document.getElementById('editor-placeholder').classList.remove('hidden');

        renderSectionsList();
        showToast('Section deleted', 'success');
    } catch (error) {
        showToast(`Failed to delete: ${error.message}`, 'error');
    }
}

async function exportSection() {
    if (!state.currentSection) return;

    try {
        const data = await api(`/api/notes/export/${state.currentSection.id}`);
        const filename = `notes_${state.currentSection.title.replace(/\s+/g, '_')}.json`;
        downloadJSON(data, filename);
        showToast('Section exported', 'success');
    } catch (error) {
        showToast(`Export failed: ${error.message}`, 'error');
    }
}

// ========================================
// Auto-save with Debounce
// ========================================

function handleContentChange() {
    document.getElementById('save-status').textContent = 'Unsaved changes';

    // Clear existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Set new timeout for auto-save
    saveTimeout = setTimeout(saveSection, 2000);
}

// ========================================
// Event Listeners
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // New section button
    document.getElementById('new-section-btn').addEventListener('click', createSection);

    // Save button
    document.getElementById('save-section-btn').addEventListener('click', saveSection);

    // Delete button
    document.getElementById('delete-section-btn').addEventListener('click', deleteSection);

    // Export section button
    document.getElementById('export-section-btn').addEventListener('click', exportSection);

    // Auto-save on content change
    document.getElementById('section-title').addEventListener('input', handleContentChange);
    document.getElementById('notes-editor').addEventListener('input', handleContentChange);

    // Save on blur
    document.getElementById('notes-editor').addEventListener('blur', () => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveSection();
        }
    });
});
