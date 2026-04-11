const EditorModels = (() => {
  const _models = new Map();
  const _viewStates = new Map();
  const _blobUrls = new Map();
  function getOrCreate(monaco, file) {
    if (_models.has(file.id)) return _models.get(file.id);
    const uri = monaco.Uri.parse(`file:///${file.id}/${file.name}`);
    const model = monaco.editor.createModel(
      file.content,
      LangMap.monacoLang(file.name),
      uri,
    );
    model.onWillDispose(() => _models.delete(file.id));
    _models.set(file.id, model);
    return model;
  }
  function saveViewState(fileId, editorInstance) {
    if (editorInstance?.getModel()) {
      _viewStates.set(fileId, editorInstance.saveViewState());
    }
  }
  function restoreViewState(fileId, editorInstance) {
    const saved = _viewStates.get(fileId);
    if (saved) editorInstance.restoreViewState(saved);
  }
  function destroyTab(fileId) {
    _viewStates.delete(fileId);
    const model = _models.get(fileId);
    if (model) {
      model.dispose();
      _models.delete(fileId);
    }
    const blob = _blobUrls.get(fileId);
    if (blob) {
      URL.revokeObjectURL(blob);
      _blobUrls.delete(fileId);
    }
  }
  function setBlobUrl(fileId, url) {
    const old = _blobUrls.get(fileId);
    if (old) URL.revokeObjectURL(old);
    _blobUrls.set(fileId, url);
  }
  function getBlobUrl(fileId) {
    return _blobUrls.get(fileId) ?? null;
  }
  return {
    getOrCreate,
    saveViewState,
    restoreViewState,
    destroyTab,
    setBlobUrl,
    getBlobUrl,
  };
})();
