package io.arcpros.signal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NetScanPlugin.class);   // must be before super.onCreate
        super.onCreate(savedInstanceState);
    }
}
