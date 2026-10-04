import { useEffect, useState } from "react";
import "./InstallCarnetPass.css";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

export default function InstallCarnetPass({ className = "" }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function onAppInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);

  async function install() {
    if (!installPrompt) {
      setShowInstructions((value) => !value);
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    await prompt.prompt();
    setShowInstructions(false);
  }

  return (
    <div className={`install-carnetpass ${className}`.trim()}>
      <button type="button" className="install-carnetpass__button" onClick={install}>
        Installer CarnetPass
      </button>
      {showInstructions && (
        <p className="install-carnetpass__help" role="status">
          {isIOS
            ? "Sur iPhone ou iPad, ouvrez le menu Partager de votre navigateur, puis choisissez Ajouter à l’écran d’accueil."
            : "Dans le menu de votre navigateur, choisissez Installer l’application ou Ajouter à l’écran d’accueil."}
        </p>
      )}
    </div>
  );
}
