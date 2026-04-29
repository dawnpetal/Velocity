#![allow(non_snake_case)]

use std::sync::Arc;

use crate::managers::{
    AccountManager, AuthManager, ClientBridgeManager, ExecutorManager, FileSystemManager,
    GlobalStateManager, IconThemeManager, InstanceManager, MultiInstanceManager, NetworkManager,
    ScriptManager, SearchManager, UpdateManager, WindowManager, WorkspaceStateManager,
};
use crate::paths;

pub struct AppContext {
    pub Network: Arc<NetworkManager>,
    pub Executor: Arc<ExecutorManager>,
    pub Account: Arc<AccountManager>,
    pub Instance: Arc<InstanceManager>,
    pub FileSystem: Arc<FileSystemManager>,
    pub WorkspaceState: Arc<WorkspaceStateManager>,
    pub GlobalState: Arc<GlobalStateManager>,
    pub Search: Arc<SearchManager>,
    pub Script: Arc<ScriptManager>,
    pub Auth: Arc<AuthManager>,
    pub Update: Arc<UpdateManager>,
    pub Window: Arc<WindowManager>,
    pub IconTheme: Arc<IconThemeManager>,
    pub MultiInstance: Arc<MultiInstanceManager>,
    pub ClientBridge: Arc<ClientBridgeManager>,
}

impl AppContext {
    pub fn build() -> Self {
        let internals = paths::internals_dir().expect("failed to resolve internals dir");

        let Network = Arc::new(NetworkManager::new().expect("failed to build network manager"));
        let Executor = Arc::new(ExecutorManager::new(Network.client().clone()));
        let MultiInstance = Arc::new(MultiInstanceManager::new(Arc::clone(&Executor)));

        Self {
            Network,
            Executor,
            Account: Arc::new(AccountManager::new()),
            Instance: Arc::new(InstanceManager::new()),
            FileSystem: Arc::new(FileSystemManager::new()),
            WorkspaceState: Arc::new(WorkspaceStateManager::new()),
            GlobalState: Arc::new(GlobalStateManager::new()),
            Search: Arc::new(SearchManager::new()),
            Script: Arc::new(ScriptManager::new()),
            Auth: Arc::new(AuthManager::new()),
            Update: Arc::new(UpdateManager::new()),
            Window: Arc::new(WindowManager::new()),
            IconTheme: Arc::new(IconThemeManager::new(internals)),
            MultiInstance,
            ClientBridge: Arc::new(ClientBridgeManager::new()),
        }
    }
}
