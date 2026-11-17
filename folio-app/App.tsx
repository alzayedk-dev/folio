import { useCallback, useEffect, useRef, useState, type ComponentType, type RefAttributes } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation, type WebViewProps } from "react-native-webview";

// react-native-webview's class types don't line up with the newest React types yet; this restates the real props.
const FolioWeb = WebView as unknown as ComponentType<WebViewProps & RefAttributes<WebView>>;

// The Folio website. The app shows it full-screen, so features and fixes stay in sync with the live site.
const SITE = "https://folio-pink-five.vercel.app";
const START = `${SITE}/portfolio`; // logged-out users are sent to the login page automatically

const EMERALD = "#047857";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <FolioWebView />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function FolioWebView() {
  const ref = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0); // bump to fully reload after an error

  // Android hardware back button: go back inside Folio instead of closing the app
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && ref.current) {
        ref.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Keep Folio pages inside the app; open everything else (news articles, email links) in the phone's browser/apps
  const onShouldStart = useCallback((req: { url: string }) => {
    const url = req.url;
    if (url.startsWith(SITE) || url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) return true;
    Linking.openURL(url).catch(() => undefined);
    return false;
  }, []);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>Folio</Text>
        <Text style={styles.title}>Lost connection to the exchange</Text>
        <Text style={styles.body}>Check your internet connection, then try again.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFailed(false);
            setKey((k) => k + 1);
          }}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FolioWeb
      key={key}
      ref={ref}
      source={{ uri: START }}
      style={styles.web}
      originWhitelist={["https://*", "http://*", "mailto:*"]}
      onShouldStartLoadWithRequest={onShouldStart}
      setSupportMultipleWindows={false}
      onNavigationStateChange={(s: WebViewNavigation) => setCanGoBack(s.canGoBack)}
      onError={() => setFailed(true)}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      javaScriptEnabled
      pullToRefreshEnabled
      allowsBackForwardNavigationGestures
      applicationNameForUserAgent="FolioApp/1.0"
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={EMERALD} />
          <Text style={styles.loadingText}>Crunching your numbers…</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  web: { flex: 1, backgroundColor: "#ffffff" },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  loadingText: { marginTop: 12, color: "#5b6b63", fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#ffffff" },
  logo: { fontSize: 32, fontWeight: "700", color: EMERALD, marginBottom: 24 },
  title: { fontSize: 18, fontWeight: "600", color: "#0f1f17", textAlign: "center" },
  body: { marginTop: 8, fontSize: 14, color: "#5b6b63", textAlign: "center" },
  button: { marginTop: 24, backgroundColor: EMERALD, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
});
