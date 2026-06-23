package expo.core;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import expo.modules.ExpoModulesPackageList;
import expo.modules.adapters.react.ModuleRegistryAdapter;
import expo.modules.core.interfaces.Package;

import java.util.List;

public class ExpoModulesPackage implements ReactPackage {
    private final ModuleRegistryAdapter adapter;

    public ExpoModulesPackage() {
        List<Package> packages = ExpoModulesPackageList.getPackageList();
        adapter = new ModuleRegistryAdapter(packages);
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return adapter.createNativeModules(reactContext);
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return adapter.createViewManagers(reactContext);
    }
}
