import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
// On lit les reglages depuis le panneau central (qui les lit lui-meme dans le .env)
import { RPC_URL, CHAIN_ID } from "./config";

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask n'est pas installe.");
      return;
    }
    try {
      setError("");
      setIsConnecting(true);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      const walletSigner = await browserProvider.getSigner();
      const walletAddress = await walletSigner.getAddress();
      const network = await browserProvider.getNetwork();
      setSigner(walletSigner);
      setAccount(walletAddress);
      setChainId(network.chainId);
    } catch (err) {
      console.error("Erreur de connexion au wallet :", err);
      setError("Connexion refusee ou impossible.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
      } else {
        connectWallet();
      }
    }
    function handleChainChanged() {
      window.location.reload();
    }
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectWallet]);

  // Bon reseau ? On compare le reseau du wallet au reglage du .env (31337 en local, 80002 sur Amoy).
  // Le 1er test (CHAIN_ID !== null) evite un faux "OK" si le reglage manque : sans lui,
  // null === null serait "vrai" et l'appli croirait etre sur le bon reseau.
  const isCorrectNetwork = CHAIN_ID !== null && chainId === CHAIN_ID;

  // Contrat capable d'ECRIRE (branche sur le signer)
  function getWriteContract(contractAddress, contractAbi) {
    if (!signer) return null;
    return new ethers.Contract(contractAddress, contractAbi, signer);
  }

  // Ajoute une intervention au carnet (ECRITURE, coute du gas)
  async function addMaintenance(contractAddress, contractAbi, boilerId, interventionType, description, technician, partChanged) {
    if (!signer) throw new Error("Wallet non connecte");
    const writeContract = new ethers.Contract(contractAddress, contractAbi, signer);
    const tx = await writeContract.addMaintenance(boilerId, interventionType, description, technician, partChanged);
    await tx.wait();
    return tx;
  }

  // Lit TOUT le carnet d'une chaudiere (LECTURE, gratuit)
  async function getMaintenances(contractAddress, contractAbi, boilerId) {
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);
    const readContract = new ethers.Contract(contractAddress, contractAbi, readProvider);
    return await readContract.getMaintenances(boilerId);
  }

  return { account, signer, chainId, isConnecting, error, isCorrectNetwork, connectWallet, getWriteContract, addMaintenance, getMaintenances };
}