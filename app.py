import os
import uuid
import threading
import zipfile
import shutil
import time
from flask import Flask, request, jsonify, render_template, send_file
import converters

app = Flask(__name__)

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
CONVERT_DIR = os.path.join(DATA_DIR, "conversions")

# Ensure folders exist
for d in [UPLOAD_DIR, CONVERT_DIR]:
    os.makedirs(d, exist_ok=True)

# In-memory tasks database
tasks = {}

def get_file_ext(filename):
    return os.path.splitext(filename)[1].lower()

def cleanup_temp_files():
    """Cleans up uploaded and converted files older than 1 hour to prevent disk bloat."""
    now = time.time()
    max_age = 3600  # 1 hour
    
    for folder in [UPLOAD_DIR, CONVERT_DIR]:
        if not os.path.exists(folder):
            continue
        for item in os.listdir(folder):
            item_path = os.path.join(folder, item)
            try:
                # Check creation/modification time
                if now - os.path.getmtime(item_path) > max_age:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                    else:
                        os.remove(item_path)
            except Exception as e:
                print(f"Error cleaning up {item_path}: {e}")

def run_conversion_job(task_id, file_paths, target_format, res_mode):
    """Executes the file conversion process in a background thread."""
    tasks[task_id] = {'status': 'processing', 'progress': 10, 'result_file': None, 'is_dir': False, 'error': None}
    try:
        task_out_dir = os.path.join(CONVERT_DIR, task_id)
        os.makedirs(task_out_dir, exist_ok=True)
        
        # Check if we have multiple files
        if len(file_paths) > 1:
            # We assume compiling multiple images into a single document
            first_ext = get_file_ext(file_paths[0])
            if first_ext not in ('.png', '.jpg', '.jpeg'):
                raise ValueError("Multiple files can only be combined if they are images (PNG, JPG).")
                
            if target_format == 'pdf':
                out_pdf = os.path.join(task_out_dir, "combined_document.pdf")
                converters.png_to_pdf(file_paths, out_pdf, res_mode=res_mode)
                tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pdf, 'is_dir': False, 'error': None}
            elif target_format == 'pptx':
                out_pptx = os.path.join(task_out_dir, "combined_presentation.pptx")
                converters.png_to_pptx(file_paths, out_pptx, res_mode=res_mode)
                tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pptx, 'is_dir': False, 'error': None}
            else:
                raise ValueError(f"Cannot compile multiple images into target format {target_format.upper()}.")
        else:
            # Single file conversion
            src_file = file_paths[0]
            ext = get_file_ext(src_file)
            base_name = os.path.splitext(os.path.basename(src_file))[0]
            
            if ext == '.pdf':
                if target_format == 'png':
                    # PDF -> PNG (outputs directory of images)
                    out_png_dir = os.path.join(task_out_dir, f"{base_name}_pages")
                    converters.pdf_to_png(src_file, out_png_dir, res_mode=res_mode)
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_png_dir, 'is_dir': True, 'error': None}
                elif target_format == 'pptx':
                    # PDF -> PPTX (uses intermediate PNGs - satisfies specific user instruction)
                    out_pptx = os.path.join(task_out_dir, f"{base_name}.pptx")
                    converters.pdf_to_pptx(src_file, out_pptx, res_mode=res_mode, temp_dir=os.path.join(task_out_dir, "temp_pngs"))
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pptx, 'is_dir': False, 'error': None}
                else:
                    raise ValueError(f"Cannot convert PDF to format {target_format.upper()}.")
                    
            elif ext in ('.pptx', '.ppt'):
                if target_format == 'pdf':
                    # PPTX -> PDF (uses AppleScript)
                    out_pdf = os.path.join(task_out_dir, f"{base_name}.pdf")
                    converters.pptx_to_pdf(src_file, out_pdf)
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pdf, 'is_dir': False, 'error': None}
                elif target_format == 'png':
                    # PPTX -> PNG (PDF intermediate then PNG render)
                    out_png_dir = os.path.join(task_out_dir, f"{base_name}_slides")
                    converters.pptx_to_png(src_file, out_png_dir, res_mode=res_mode, temp_dir=os.path.join(task_out_dir, "temp"))
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_png_dir, 'is_dir': True, 'error': None}
                else:
                    raise ValueError(f"Cannot convert PPTX to format {target_format.upper()}.")
                    
            elif ext in ('.png', '.jpg', '.jpeg'):
                if target_format == 'pdf':
                    out_pdf = os.path.join(task_out_dir, f"{base_name}.pdf")
                    converters.png_to_pdf([src_file], out_pdf, res_mode=res_mode)
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pdf, 'is_dir': False, 'error': None}
                elif target_format == 'pptx':
                    out_pptx = os.path.join(task_out_dir, f"{base_name}.pptx")
                    converters.png_to_pptx([src_file], out_pptx, res_mode=res_mode)
                    tasks[task_id] = {'status': 'completed', 'progress': 100, 'result_file': out_pptx, 'is_dir': False, 'error': None}
                else:
                    raise ValueError(f"Cannot convert image to format {target_format.upper()}.")
            else:
                raise ValueError(f"Unsupported source format: {ext}")
                
    except Exception as e:
        print(f"Error in task {task_id}: {e}")
        tasks[task_id] = {'status': 'failed', 'progress': 100, 'result_file': None, 'is_dir': False, 'error': str(e)}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload():
    # Clean up old files on new upload to maintain small storage footprint
    cleanup_temp_files()
    
    if 'files[]' not in request.files:
        return jsonify({'error': 'No file part in request'}), 400
        
    uploaded_files = request.files.getlist('files[]')
    saved_files = []
    
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)
    
    for file in uploaded_files:
        if file.filename == '':
            continue
            
        filename = file.filename
        dest_path = os.path.join(session_dir, filename)
        file.save(dest_path)
        
        saved_files.append({
            'name': filename,
            'size': os.path.getsize(dest_path),
            'type': get_file_ext(filename)[1:],
            'path': dest_path
        })
        
    return jsonify({'files': saved_files})

@app.route('/api/convert', methods=['POST'])
def convert():
    data = request.json or {}
    file_paths = data.get('file_paths', [])
    target_format = data.get('target_format')
    res_mode = data.get('res_mode', 'height_1080')
    
    if not file_paths:
        return jsonify({'error': 'No files provided for conversion'}), 400
    if not target_format:
        return jsonify({'error': 'No target format specified'}), 400
        
    task_id = str(uuid.uuid4())
    tasks[task_id] = {'status': 'pending', 'progress': 0, 'result_file': None, 'is_dir': False, 'error': None}
    
    # Run conversion job in a background thread to prevent UI freezing
    thread = threading.Thread(
        target=run_conversion_job,
        args=(task_id, file_paths, target_format, res_mode)
    )
    thread.start()
    
    return jsonify({'task_id': task_id})

@app.route('/api/task/<task_id>', methods=['GET'])
def get_task_status(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task)

@app.route('/api/download/<task_id>', methods=['GET'])
def download(task_id):
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
        
    if task['status'] != 'completed':
        return jsonify({'error': f"Task status is {task['status']}. Cannot download."}), 400
        
    result_path = task['result_file']
    if not result_path or not os.path.exists(result_path):
        return jsonify({'error': 'Result file not found on server.'}), 404
        
    if task['is_dir']:
        # Zip directory of images and serve ZIP file
        zip_path = result_path + ".zip"
        if not os.path.exists(zip_path):
            shutil.make_archive(result_path, 'zip', result_path)
        return send_file(zip_path, as_attachment=True, download_name=f"{os.path.basename(result_path)}.zip")
    else:
        # Serve the single file directly
        filename = os.path.basename(result_path)
        return send_file(result_path, as_attachment=True, download_name=filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
