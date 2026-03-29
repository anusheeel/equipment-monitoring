// GIP Equipment Monitoring — Frontend Application
// All state managed in-memory, synced to server on explicit Save

let STATE = {
    fleet: [],
    projects: [],
    tracking: [],
    details: []
};

let assigningEquipmentId = null;
let fleetEditMode = false;
let editingFleetId = null; // null = new item, string = editing existing

// ── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);

async function loadData() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        STATE.fleet = data.fleet || [];
        STATE.projects = data.projects || [];
        STATE.tracking = data.tracking || [];
        STATE.details = data.details || [];
        renderTracking();
        updateStats();
    } catch (err) {
        showToast('Failed to load data: ' + err.message, 'error');
    }
}

// ── Render Tracking Table ───────────────────────────────────────────
function renderTracking() {
    const tbody = document.getElementById('tracking-tbody');

    if (STATE.tracking.length === 0) {
        tbody.innerHTML = '<tr id="empty-row"><td colspan="7" class="empty-state">No equipment tracked yet. Click "Add Equipment" to begin.</td></tr>';
        return;
    }

    const startVal = (item) => { const d = formatDate(item.Assigned_Start_Date); return d === '\u2014' ? '' : d; };
    const endVal = (item) => { const d = formatDate(item.Expected_End_Date); return d === '\u2014' ? '' : d; };

    tbody.innerHTML = STATE.tracking.map((item, idx) => `
        <tr onclick="openDetail('${escHtml(item.Equipment_ID)}')" data-id="${escHtml(item.Equipment_ID)}">
            <td><strong>${escHtml(item.Equipment_ID)}</strong></td>
            <td>${escHtml(item.Description)}</td>
            <td>${statusBadge(item.Status)}</td>
            <td>${escHtml(item.Assigned_Project || '\u2014')}</td>
            <td onclick="event.stopPropagation()">
                <input type="date" class="inline-date" value="${startVal(item)}"
                       onchange="updateTrackingDate('${escHtml(item.Equipment_ID)}', 'Assigned_Start_Date', this.value)">
            </td>
            <td onclick="event.stopPropagation()">
                <input type="date" class="inline-date" value="${endVal(item)}"
                       onchange="updateTrackingDate('${escHtml(item.Equipment_ID)}', 'Expected_End_Date', this.value)">
            </td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); openAssignProjectModal('${escHtml(item.Equipment_ID)}')">
                    Assign Project
                </button>
            </td>
        </tr>
    `).join('');
}

function statusBadge(status) {
    if (!status) return '<span class="badge badge-available">Available</span>';
    const s = status.toLowerCase().replace(/\s+/g, '');
    const classMap = {
        'available': 'badge-available',
        'assigned': 'badge-assigned',
        'intransit': 'badge-transit',
        'undermaintenance': 'badge-maintenance',
        'outofservice': 'badge-outofservice'
    };
    const cls = classMap[s] || 'badge-available';
    return `<span class="badge ${cls}">${escHtml(status)}</span>`;
}

function updateStats() {
    const total = STATE.tracking.length;
    const assigned = STATE.tracking.filter(t => t.Assigned_Project && t.Assigned_Project !== '').length;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-assigned').textContent = assigned;
    document.getElementById('stat-available').textContent = total - assigned;
}

// ── Add Equipment Modal ─────────────────────────────────────────────
function openAddEquipmentModal() {
    fleetEditMode = false;
    updateFleetEditUI();
    cancelFleetItemForm();
    renderFleetList();
    document.getElementById('modal-add-equipment').classList.add('active');
    document.getElementById('fleet-search').value = '';
    document.getElementById('fleet-search').focus();
}

function toggleFleetEditMode() {
    fleetEditMode = !fleetEditMode;
    updateFleetEditUI();
    cancelFleetItemForm();
    renderFleetList(document.getElementById('fleet-search').value);
}

function updateFleetEditUI() {
    const btn = document.getElementById('btn-toggle-fleet-edit');
    const addBtn = document.getElementById('btn-add-fleet-item');
    if (fleetEditMode) {
        btn.textContent = 'Done';
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary');
        addBtn.style.display = '';
    } else {
        btn.textContent = 'Edit Fleet';
        btn.classList.add('btn-outline');
        btn.classList.remove('btn-primary');
        addBtn.style.display = 'none';
    }
}

function renderFleetList(filter = '') {
    const container = document.getElementById('fleet-list');
    const trackedIds = new Set(STATE.tracking.map(t => t.Equipment_ID));
    const filtered = STATE.fleet.filter(f => {
        const searchStr = `${f.Equipment_ID} ${f.Description}`.toLowerCase();
        return searchStr.includes(filter.toLowerCase());
    });

    container.innerHTML = filtered.map(f => {
        const alreadyTracked = trackedIds.has(f.Equipment_ID);
        const clickAction = fleetEditMode
            ? ''
            : `onclick="addEquipment('${escHtml(f.Equipment_ID)}', '${escHtml(f.Description)}')"`;
        const disabledClass = (!fleetEditMode && alreadyTracked) ? 'disabled' : '';

        return `
            <div class="list-item ${disabledClass}" ${clickAction}>
                <div class="list-item-title">${escHtml(f.Equipment_ID)} — ${escHtml(f.Description)}</div>
                <div class="list-item-sub">
                    ${f.Corporate_Rate ? 'Rate: $' + escHtml(String(f.Corporate_Rate)) + '/hr' : ''}
                    ${!fleetEditMode && alreadyTracked ? ' (Already tracked)' : ''}
                </div>
                ${fleetEditMode ? `
                    <div class="list-item-actions">
                        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation(); editFleetItem('${escHtml(f.Equipment_ID)}')">Edit</button>
                        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation(); deleteFleetItem('${escHtml(f.Equipment_ID)}')">Delete</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching equipment found.</div>';
    }
}

function filterFleetList() {
    const q = document.getElementById('fleet-search').value;
    renderFleetList(q);
}

// ── Fleet Edit Functions ────────────────────────────────────────────
function openFleetItemForm(id) {
    editingFleetId = id || null;
    const form = document.getElementById('fleet-item-form');
    const title = document.getElementById('fleet-form-title');
    const idInput = document.getElementById('fleet-form-id');

    if (editingFleetId) {
        const item = STATE.fleet.find(f => f.Equipment_ID === editingFleetId);
        title.textContent = 'Edit Fleet Item';
        idInput.value = item.Equipment_ID;
        idInput.readOnly = true;
        document.getElementById('fleet-form-desc').value = item.Description || '';
        document.getElementById('fleet-form-rate').value = item.Corporate_Rate || 0;
    } else {
        title.textContent = 'New Fleet Item';
        idInput.value = '';
        idInput.readOnly = false;
        document.getElementById('fleet-form-desc').value = '';
        document.getElementById('fleet-form-rate').value = '';
    }
    form.style.display = '';
}

function cancelFleetItemForm() {
    document.getElementById('fleet-item-form').style.display = 'none';
    editingFleetId = null;
}

function editFleetItem(id) {
    openFleetItemForm(id);
}

async function saveFleetItem() {
    const id = document.getElementById('fleet-form-id').value.trim();
    const desc = document.getElementById('fleet-form-desc').value.trim();
    const rate = parseFloat(document.getElementById('fleet-form-rate').value) || 0;

    if (!id) { showToast('Equipment ID is required', 'error'); return; }
    if (!desc) { showToast('Description is required', 'error'); return; }

    try {
        const isEdit = editingFleetId !== null;
        const url = isEdit ? '/api/fleet/edit' : '/api/fleet/add';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Equipment_ID: id, Description: desc, Corporate_Rate: rate })
        });
        const data = await res.json();
        if (data.success) {
            STATE.fleet = data.fleet;
            cancelFleetItemForm();
            renderFleetList(document.getElementById('fleet-search').value);
            showToast(isEdit ? `${id} updated` : `${id} added to fleet`);
        }
    } catch (err) {
        showToast('Failed to save fleet item: ' + err.message, 'error');
    }
}

async function deleteFleetItem(id) {
    if (!confirm(`Delete ${id} from fleet catalog?`)) return;
    try {
        const res = await fetch('/api/fleet/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Equipment_ID: id })
        });
        const data = await res.json();
        if (data.success) {
            STATE.fleet = data.fleet;
            renderFleetList(document.getElementById('fleet-search').value);
            showToast(`${id} removed from fleet`);
        }
    } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
    }
}

async function updateTrackingDate(equipmentId, field, value) {
    try {
        const body = { Equipment_ID: equipmentId };
        body[field] = value;
        const res = await fetch('/api/tracking/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            STATE.tracking = data.tracking;
            showToast(`${field === 'Assigned_Start_Date' ? 'Start' : 'End'} date updated`);
        }
    } catch (err) {
        showToast('Failed to update date: ' + err.message, 'error');
    }
}

async function addEquipment(equipmentId, description) {
    if (fleetEditMode) return;
    try {
        const res = await fetch('/api/tracking/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Equipment_ID: equipmentId, Description: description })
        });
        const data = await res.json();
        if (data.success) {
            STATE.tracking = data.tracking;
            STATE.details = data.details;
            renderTracking();
            updateStats();
            closeModalById('modal-add-equipment');
            showToast(`${equipmentId} added to tracking`);
        }
    } catch (err) {
        showToast('Failed to add equipment: ' + err.message, 'error');
    }
}

// ── Assign Project Modal ────────────────────────────────────────────
function openAssignProjectModal(equipmentId) {
    assigningEquipmentId = equipmentId;
    const item = STATE.tracking.find(t => t.Equipment_ID === equipmentId);
    document.getElementById('assign-equipment-name').textContent =
        `${item.Equipment_ID} — ${item.Description}`;
    document.getElementById('assign-start-date').value = '';
    document.getElementById('assign-end-date').value = '';
    renderProjectList();
    document.getElementById('modal-assign-project').classList.add('active');
    document.getElementById('project-search').value = '';
    document.getElementById('project-search').focus();
}

function renderProjectList(filter = '') {
    const container = document.getElementById('project-list');
    const filtered = STATE.projects.filter(p => {
        const searchStr = `${p.Project_ID} ${p.Project_Name} ${p.Location || ''}`.toLowerCase();
        return searchStr.includes(filter.toLowerCase());
    });

    container.innerHTML = filtered.map(p => `
        <div class="list-item" onclick="assignProject('${escHtml(p.Project_ID)}', '${escHtml(p.Project_Name)}')">
            <div class="list-item-title">${escHtml(p.Project_ID)} — ${escHtml(p.Project_Name)}</div>
            <div class="list-item-sub">
                ${p.Location ? 'Location: ' + escHtml(p.Location) : ''}
                ${p.Start_Date ? ' | Start: ' + escHtml(formatDate(p.Start_Date)) : ''}
                ${p.End_Date ? ' | End: ' + escHtml(formatDate(p.End_Date)) : ''}
            </div>
        </div>
    `).join('');

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching projects found.</div>';
    }
}

function filterProjectList() {
    const q = document.getElementById('project-search').value;
    renderProjectList(q);
}

async function assignProject(projectId, projectName) {
    const startDate = document.getElementById('assign-start-date').value;
    const endDate = document.getElementById('assign-end-date').value;

    try {
        const res = await fetch('/api/tracking/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                Equipment_ID: assigningEquipmentId,
                Status: 'Assigned',
                Assigned_Project: `${projectId} - ${projectName}`,
                Assigned_Start_Date: startDate,
                Expected_End_Date: endDate
            })
        });
        const data = await res.json();
        if (data.success) {
            STATE.tracking = data.tracking;
            renderTracking();
            updateStats();
            closeModalById('modal-assign-project');
            showToast(`Assigned to ${projectName}`);
        }
    } catch (err) {
        showToast('Failed to assign project: ' + err.message, 'error');
    }
}

// ── Detail Panel ────────────────────────────────────────────────────
let detailShowingLogs = false;

function openDetail(equipmentId) {
    const detail = STATE.details.find(d => d.Equipment_ID === equipmentId);
    if (!detail) return;

    document.getElementById('detail-title').textContent = equipmentId;
    document.getElementById('detail-id').value = detail.Equipment_ID;
    document.getElementById('detail-status').value = detail.Current_Status || 'Available';
    document.getElementById('detail-hours-deployed').value = detail.Hours_Since_Deployment || 0;
    document.getElementById('detail-maintenance-hours').value = detail.Maintenance_Hours || 0;
    document.getElementById('detail-total-hours').value = detail.Total_Operated_Hours || 0;
    document.getElementById('detail-notes').value = detail.Notes || '';

    // Always open to edit view
    detailShowingLogs = false;
    document.getElementById('detail-edit-view').style.display = '';
    document.getElementById('detail-logs-view').style.display = 'none';
    document.getElementById('btn-view-logs').textContent = 'View Logs';

    document.getElementById('detail-panel').classList.add('open');
}

function closeDetailPanel() {
    document.getElementById('detail-panel').classList.remove('open');
}

async function toggleLogs() {
    detailShowingLogs = !detailShowingLogs;
    const editView = document.getElementById('detail-edit-view');
    const logsView = document.getElementById('detail-logs-view');
    const btn = document.getElementById('btn-view-logs');

    if (detailShowingLogs) {
        editView.style.display = 'none';
        logsView.style.display = '';
        btn.textContent = 'Edit Details';
        // Fetch logs for this equipment
        const equipmentId = document.getElementById('detail-id').value;
        await loadLogs(equipmentId);
    } else {
        editView.style.display = '';
        logsView.style.display = 'none';
        btn.textContent = 'View Logs';
    }
}

async function loadLogs(equipmentId) {
    const container = document.getElementById('logs-container');
    container.innerHTML = '<div class="logs-empty">Loading...</div>';

    try {
        const res = await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Equipment_ID: equipmentId })
        });
        const data = await res.json();
        if (data.success && data.logs.length > 0) {
            // Show newest first
            const sorted = data.logs.slice().reverse();
            container.innerHTML = sorted.map(log => `
                <div class="log-entry">
                    <div class="log-timestamp">${escHtml(log.Timestamp)}</div>
                    <div class="log-fields">
                        <div>
                            <div class="log-field-label">Status</div>
                            <div class="log-field-value">${escHtml(log.Current_Status || '-')}</div>
                        </div>
                        <div>
                            <div class="log-field-label">Hours Deployed</div>
                            <div class="log-field-value">${log.Hours_Since_Deployment != null ? log.Hours_Since_Deployment : '-'}</div>
                        </div>
                        <div>
                            <div class="log-field-label">Maintenance Hrs</div>
                            <div class="log-field-value">${log.Maintenance_Hours != null ? log.Maintenance_Hours : '-'}</div>
                        </div>
                        <div>
                            <div class="log-field-label">Total Operated</div>
                            <div class="log-field-value">${log.Total_Operated_Hours != null ? log.Total_Operated_Hours : '-'}</div>
                        </div>
                        ${log.Notes ? `
                            <div class="log-notes">
                                <div class="log-field-label">Notes</div>
                                <div class="log-field-value">${escHtml(log.Notes)}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="logs-empty">No previous logs for this equipment.</div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="logs-empty">Failed to load logs.</div>';
    }
}

async function saveDetail() {
    const equipmentId = document.getElementById('detail-id').value;
    const payload = {
        Equipment_ID: equipmentId,
        Current_Status: document.getElementById('detail-status').value,
        Hours_Since_Deployment: parseFloat(document.getElementById('detail-hours-deployed').value) || 0,
        Maintenance_Hours: parseFloat(document.getElementById('detail-maintenance-hours').value) || 0,
        Total_Operated_Hours: parseFloat(document.getElementById('detail-total-hours').value) || 0,
        Notes: document.getElementById('detail-notes').value
    };

    try {
        const res = await fetch('/api/details/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            STATE.details = data.details;
            STATE.tracking = data.tracking;
            renderTracking();
            updateStats();
            showToast(`${equipmentId} details updated and saved to Excel`);
        }
    } catch (err) {
        showToast('Failed to update details: ' + err.message, 'error');
    }
}

// ── Save All ────────────────────────────────────────────────────────
async function saveAll() {
    try {
        const res = await fetch('/api/save', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('All data saved to Excel files!');
        }
    } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
    }
}

// ── Modal Helpers ───────────────────────────────────────────────────
function closeModal(event, id) {
    if (event.target === event.currentTarget) {
        document.getElementById(id).classList.remove('active');
    }
}

function closeModalById(id) {
    document.getElementById(id).classList.remove('active');
}

// ── Utilities ───────────────────────────────────────────────────────
function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(val) {
    if (!val) return '—';
    // Handle Excel serial dates (numbers)
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400000);
        return date.toISOString().split('T')[0];
    }
    // Handle ISO strings or date strings
    const str = String(val);
    if (str.includes('T')) return str.split('T')[0];
    return str || '—';
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
