// On importe les outils React dont on a besoin
import { useState, useEffect, useCallback } from "react";
// ethers = notre traducteur entre la page web et la blockchain
import { ethers } from "ethers";

// chainId du reseau Hardhat local. En ethers v6, les chainId sont des BigInt (le "n" a la fin)
const HARDHAT_CHAIN_ID = 31337n;

// Ce "hook" range toute la logique du wallet dans une seule boite reutilisable.
// N'importe quel ecran qui l'appelle recupere : l'adresse connectee, le signer, etc.
export function useWallet() {
  // --- Les cases memoire du hook ---
  const [account, setAccount] = useState(null);          // adresse connectee (null = pas connecte)
  const [signer, setSigner] = useState(null);            // le "signataire" capable d'ecrire
  const [chainId, setChainId] = useState(null);          // reseau actuellement choisi dans MetaMask
  const [isConnecting, setIsConnecting] = useState(false); // true pendant la demande de connexion
  const [error, setError] = useState("");                // message d'erreur eventuel

  // --- La fonction de connexion ---
  // useCallback = on "memorise" la fonction pour eviter de la recreer a chaque affichage (propre)
  const connectWallet = useCallback(async () => {
    // 1. MetaMask est-il installe ? Il s'annonce via window.ethereum
    if (!window.ethereum) {
      setError("MetaMask n'est pas installe.");
      return;
    }

    try {
      setError("");
      setIsConnecting(true);

      // 2. On cree un provider branche sur MetaMask (et non plus sur l'URL en dur)
      const browserProvider = new ethers.BrowserProvider(window.ethereum);

      // 3. On demande la connexion : CECI ouvre la fenetre MetaMask
      await browserProvider.send("eth_requestAccounts", []);

      // 4. On recupere le signer (en ethers v6, c'est asynchrone -> await)
      const walletSigner = await browserProvider.getSigner();

      // 5. On recupere l'adresse et le reseau
      const walletAddress = await walletSigner.getAddress();
      const network = await browserProvider.getNetwork();

      // 6. On range tout dans les cases memoire
      setSigner(walletSigner);
      setAccount(walletAddress);
      setChainId(network.chainId);
    } catch (err) {
      // L'utilisateur a refuse, ou autre souci
      console.error("Erreur de connexion au wallet :", err);
      setError("Connexion refusee ou impossible.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // --- Ecouter les changements dans MetaMask ---
  // Si l'utilisateur change de compte ou de reseau, on reagit automatiquement
  useEffect(() => {
    if (!window.ethereum) return;

    // L'utilisateur a change de compte dans MetaMask
    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        setAccount(null); // deconnexion : plus aucun compte
        setSigner(null);
      } else {
        connectWallet(); // on recharge avec le nouveau compte
      }
    }

    // L'utilisateur a change de reseau : le plus sur est de recharger la page
    function handleChainChanged() {
      window.location.reload();
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    // Nettoyage : on retire les ecouteurs quand le composant disparait (bonne pratique)
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectWallet]);

  // Petit indicateur pratique : est-on sur le bon reseau ?
  const isCorrectNetwork = chainId === HARDHAT_CHAIN_ID;

  // Le hook renvoie tout ce dont les ecrans auront besoin
  return { account, signer, chainId, isConnecting, error, isCorrectNetwork, connectWallet };
}