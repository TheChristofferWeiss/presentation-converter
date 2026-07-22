document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const selectFilesBtn = document.querySelector('.select-files-btn');
    const selectFolderBtn = document.querySelector('.select-folder-btn');
    const workspace = document.getElementById('workspace');
    const fileList = document.getElementById('file-list');
    const queueCount = document.getElementById('queue-count');
    const targetFormatSelect = document.getElementById('target-format');
    const resModeSelect = document.getElementById('res-mode');
    const scaleModeSelect = document.getElementById('scale-mode');
    const scaleGroup = document.getElementById('scale-group');
    const convertBtn = document.getElementById('convert-btn');
    const resultsSection = document.getElementById('results-section');
    const resultsList = document.getElementById('results-list');
    const downloadAllBtn = document.getElementById('download-all-btn');

    // Local state
    let filesQueue = []; // { id, name, size, type, path, status, error, resultTaskId }
    let conversionTasks = []; // list of running task IDs

    // SVG icons
    const icons = {
        pdf: `<svg class="file-icon-pdf" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        png: `<svg class="file-icon-png" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        pptx: `<svg class="file-icon-pptx" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4c0-.5.2-1 .6-1.4C5 2.2 5.5 2 6 2h8l6 6v14c0 .5-.2 1-.6 1.4-.4.4-.9.6-1.4.6H6c-.5 0-1-.2-1.4-.6-.4-.4-.6-.9-.6-1.4z"/><polyline points="14 2 14 8 20 8"/><path d="M8 16h8"/><path d="M8 12h8"/></svg>`,
        unknown: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        remove: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
        download: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        spinner: `<div class="btn-spinner"></div>`
    };

    // Dropzone Events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSelectedFiles(e.dataTransfer.files);
        }
    });

    selectFilesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    selectFolderBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        folderInput.click();
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleSelectedFiles(fileInput.files);
        }
        fileInput.value = '';
    });

    folderInput.addEventListener('change', () => {
        if (folderInput.files.length > 0) {
            handleSelectedFiles(folderInput.files);
        }
        folderInput.value = '';
    });

    // File handling
    function handleSelectedFiles(filesList) {
        const filesToUpload = [];
        const skipped = [];
        for (let i = 0; i < filesList.length; i++) {
            const file = filesList[i];
            const ext = getExtension(file.name);
            const validExts = ['pdf', 'png', 'jpg', 'jpeg'];

            if (!validExts.includes(ext)) {
                skipped.push(file.name);
                continue;
            }

            const fileId = generateUuid();
            const fileObj = {
                id: fileId,
                name: file.name,
                size: file.size,
                type: ext === 'jpg' || ext === 'jpeg' ? 'png' : ext, // treat jpg as image/png category
                status: 'uploading',
                path: null,
                error: null,
                resultTaskId: null
            };

            filesQueue.push(fileObj);
            filesToUpload.push({ file, id: fileId });
        }

        if (skipped.length > 0) {
            const shown = skipped.slice(0, 5).join(', ');
            const more = skipped.length > 5 ? ` and ${skipped.length - 5} more` : '';
            alert(`Skipped ${skipped.length} unsupported file(s): ${shown}${more}. Only PDF, PNG, and JPG are accepted.`);
        }

        if (filesQueue.length > 0) {
            workspace.classList.remove('hidden');
            renderQueue();
            updateSettingsOptions();

            // Upload each file
            filesToUpload.forEach(item => uploadFile(item.file, item.id));
        }
    }

    function getExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    function generateUuid() {
        return 'file_' + Math.random().toString(36).substring(2, 9);
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Upload files to backend
    function uploadFile(file, fileId) {
        const formData = new FormData();
        formData.append('files[]', file);

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) throw new Error('Upload failed');
            return response.json();
        })
        .then(data => {
            const fileObj = filesQueue.find(f => f.id === fileId);
            if (fileObj && data.files && data.files.length > 0) {
                fileObj.status = 'ready';
                fileObj.path = data.files[0].path; // backend path
                renderQueue();
            }
        })
        .catch(err => {
            const fileObj = filesQueue.find(f => f.id === fileId);
            if (fileObj) {
                fileObj.status = 'failed';
                fileObj.error = err.message || 'Upload error';
                renderQueue();
            }
        });
    }

    // Render Queue UI
    function renderQueue() {
        fileList.innerHTML = '';
        queueCount.textContent = `${filesQueue.length} ${filesQueue.length === 1 ? 'File' : 'Files'}`;

        filesQueue.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            let iconHtml = icons.unknown;
            if (['png', 'jpg', 'jpeg'].includes(file.type)) iconHtml = icons.png;
            else if (file.type === 'pdf') iconHtml = icons.pdf;

            let statusBadge = '';
            if (file.status === 'uploading') {
                statusBadge = `<span class="badge badge-status status-pending">Uploading...</span>`;
            } else if (file.status === 'ready') {
                statusBadge = `<span class="badge badge-status status-success">Ready</span>`;
            } else if (file.status === 'failed') {
                statusBadge = `<span class="badge badge-status status-failed" title="${file.error}">Failed</span>`;
            } else if (file.status === 'converting') {
                statusBadge = `<span class="badge badge-status status-converting">Converting...</span>`;
            }

            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon-wrapper ${file.type === 'pdf' ? 'file-icon-pdf' : (file.type === 'png' ? 'file-icon-png' : 'file-icon-pptx')}">
                        ${iconHtml}
                    </div>
                    <div class="file-details">
                        <span class="file-name" title="${file.name}">${file.name}</span>
                        <span class="file-size">${formatBytes(file.size)}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 16px;">
                    ${statusBadge}
                    <button class="btn-danger-link remove-file-btn" data-id="${file.id}">
                        ${icons.remove}
                    </button>
                </div>
            `;

            // Bind remove button
            fileItem.querySelector('.remove-file-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeFile(file.id);
            });

            fileList.appendChild(fileItem);
        });

        // Toggle Convert Button state
        const anyUploading = filesQueue.some(f => f.status === 'uploading');
        const anyReady = filesQueue.some(f => f.status === 'ready');
        
        if (anyReady && !anyUploading) {
            convertBtn.removeAttribute('disabled');
        } else {
            convertBtn.setAttribute('disabled', 'true');
        }
    }

    function removeFile(fileId) {
        filesQueue = filesQueue.filter(f => f.id !== fileId);
        renderQueue();
        updateSettingsOptions();
        
        if (filesQueue.length === 0) {
            workspace.classList.add('hidden');
        }
    }

    // Dynamic settings options
    function updateSettingsOptions() {
        if (filesQueue.length === 0) return;
        
        const isAllImages = filesQueue.every(f => ['png', 'jpg', 'jpeg'].includes(f.type));
        const isAllPdfs = filesQueue.every(f => f.type === 'pdf');

        // Save current selection to restore if possible
        const prevValue = targetFormatSelect.value;
        targetFormatSelect.innerHTML = '';

        if (isAllImages) {
            targetFormatSelect.innerHTML = `
                <option value="pptx" selected>PowerPoint Presentation (.pptx)</option>
            `;
            scaleGroup.classList.remove('hidden');
        } else if (isAllPdfs) {
            targetFormatSelect.innerHTML = `
                <option value="pptx" ${prevValue === 'pptx' ? 'selected' : 'selected'}>PowerPoint Presentation (.pptx)</option>
                <option value="png" ${prevValue === 'png' ? 'selected' : ''}>PNG Images (.png)</option>
            `;
            scaleGroup.classList.add('hidden');
        } else {
            targetFormatSelect.innerHTML = `
                <option value="pptx">PowerPoint Presentation (.pptx)</option>
                <option value="png">PNG Images (.png)</option>
            `;
            scaleGroup.classList.add('hidden');
        }
        
        triggerSelectChange();
    }

    targetFormatSelect.addEventListener('change', triggerSelectChange);

    function triggerSelectChange() {
        if (targetFormatSelect.value === 'pptx') {
            scaleGroup.classList.remove('hidden');
        } else {
            scaleGroup.classList.add('hidden');
        }
    }

    // Trigger Conversion
    convertBtn.addEventListener('click', () => {
        const targetFormat = targetFormatSelect.value;
        const resMode = resModeSelect.value;
        const scaleMode = scaleModeSelect.value;
        
        const readyFiles = filesQueue.filter(f => f.status === 'ready');
        if (readyFiles.length === 0) return;

        // Set button loading
        convertBtn.setAttribute('disabled', 'true');
        convertBtn.querySelector('.btn-text').textContent = 'Converting...';
        convertBtn.querySelector('.btn-spinner').classList.remove('hidden');
        
        resultsSection.classList.add('hidden');
        resultsList.innerHTML = '';
        conversionTasks = [];

        // Determine if we should compile images into a single deck or convert individually
        const isCompilingImages = targetFormat === 'pptx' &&
                                  readyFiles.every(f => ['png', 'jpg', 'jpeg'].includes(f.type));

        if (isCompilingImages) {
            // Compile ALL images into ONE presentation
            const filePaths = readyFiles.map(f => f.path);
            readyFiles.forEach(f => f.status = 'converting');
            renderQueue();

            startConversionTask(filePaths, targetFormat, resMode, scaleMode)
            .then(taskId => {
                conversionTasks.push(taskId);
                pollTaskStatus(taskId, 'Combined Presentation');
            })
            .catch(err => {
                alert(`Conversion startup failed: ${err.message}`);
                resetConvertBtn();
            });
        } else {
            // Convert files individually
            const promises = readyFiles.map(file => {
                file.status = 'converting';
                return startConversionTask([file.path], targetFormat, resMode, scaleMode)
                    .then(taskId => {
                        file.resultTaskId = taskId;
                        conversionTasks.push(taskId);
                        pollTaskStatus(taskId, file.name, file.id);
                    });
            });

            renderQueue();

            Promise.all(promises)
            .catch(err => {
                alert(`Some conversions failed to start: ${err.message}`);
                resetConvertBtn();
            });
        }
    });

    function startConversionTask(filePaths, targetFormat, resMode, scaleMode) {
        return fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_paths: filePaths,
                target_format: targetFormat,
                res_mode: resMode,
                scale_mode: scaleMode
            })
        })
        .then(res => {
            if (!res.ok) throw new Error('Failed to create conversion task');
            return res.json();
        })
        .then(data => data.task_id);
    }

    function pollTaskStatus(taskId, labelName, fileId = null) {
        const interval = setInterval(() => {
            fetch(`/api/task/${taskId}`)
            .then(res => {
                if (!res.ok) throw new Error('Task check failed');
                return res.json();
            })
            .then(data => {
                if (data.status === 'completed') {
                    clearInterval(interval);
                    
                    // Update file queue status if linked to a single file
                    if (fileId) {
                        const file = filesQueue.find(f => f.id === fileId);
                        if (file) {
                            file.status = 'ready';
                            renderQueue();
                        }
                    } else {
                        // Compiling images: mark all images ready
                        filesQueue.forEach(f => {
                            if (f.status === 'converting') f.status = 'ready';
                        });
                        renderQueue();
                    }

                    // Remove task from running list and render result.
                    // Label with the converted file's own name, not the source file's.
                    conversionTasks = conversionTasks.filter(id => id !== taskId);
                    addResultItem(taskId, data.result_name || labelName, true);
                    checkAllTasksComplete();

                } else if (data.status === 'failed') {
                    clearInterval(interval);

                    if (fileId) {
                        const file = filesQueue.find(f => f.id === fileId);
                        if (file) {
                            file.status = 'failed';
                            file.error = data.error || 'Conversion failed';
                            renderQueue();
                        }
                    } else {
                        filesQueue.forEach(f => {
                            if (f.status === 'converting') {
                                f.status = 'failed';
                                f.error = data.error || 'Conversion failed';
                            }
                        });
                        renderQueue();
                    }

                    conversionTasks = conversionTasks.filter(id => id !== taskId);
                    addResultItem(taskId, labelName, false, data.error);
                    checkAllTasksComplete();
                }
            })
            .catch(err => {
                clearInterval(interval);
                conversionTasks = conversionTasks.filter(id => id !== taskId);
                addResultItem(taskId, labelName, false, err.message);
                checkAllTasksComplete();
            });
        }, 1000);
    }

    function addResultItem(taskId, filename, success, errorMsg = '') {
        resultsSection.classList.remove('hidden');
        
        const item = document.createElement('div');
        item.className = 'result-item';
        
        if (success) {
            item.innerHTML = `
                <div class="result-meta">
                    <span style="color: var(--success); display: flex;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </span>
                    <span class="file-name" style="font-weight: 500;">Converted: ${filename}</span>
                </div>
                <a href="/api/download/${taskId}" class="btn btn-secondary btn-sm" download>
                    ${icons.download} Download
                </a>
            `;
        } else {
            item.innerHTML = `
                <div class="result-meta">
                    <span style="color: var(--danger); display: flex;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                    </span>
                    <div style="display: flex; flex-direction: column;">
                        <span class="file-name" style="color: var(--text-secondary);">Failed: ${filename}</span>
                        <span style="color: var(--danger); font-size: 0.75rem; margin-top: 2px;">${errorMsg}</span>
                    </div>
                </div>
                <div></div>
            `;
        }

        resultsList.appendChild(item);
    }

    function checkAllTasksComplete() {
        if (conversionTasks.length === 0) {
            resetConvertBtn();
            
            // Show Download All button if there is more than 1 successful result item
            const successDownloads = resultsList.querySelectorAll('a[download]');
            if (successDownloads.length > 1) {
                downloadAllBtn.classList.remove('hidden');
            } else {
                downloadAllBtn.classList.add('hidden');
            }
        }
    }

    function resetConvertBtn() {
        convertBtn.removeAttribute('disabled');
        convertBtn.querySelector('.btn-text').textContent = 'Start Conversion';
        convertBtn.querySelector('.btn-spinner').classList.add('hidden');
    }

    // ZIP Download All click handler
    downloadAllBtn.addEventListener('click', () => {
        const downloadLinks = Array.from(resultsList.querySelectorAll('a[download]'));
        if (downloadLinks.length === 0) return;

        // Since they are individual endpoints, we can just trigger click on each link sequentially,
        // or trigger a browser download window for each.
        // This is simple and works natively without complex server-side zipping of results.
        downloadLinks.forEach((link, idx) => {
            setTimeout(() => {
                link.click();
            }, idx * 300);
        });
    });
});
