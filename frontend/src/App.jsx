// App.jsx = l'ecran principal de ton application (ce qui s'affiche dans le navigateur)

// "App" est un composant React : une fonction qui retourne ce qu'on veut afficher a l'ecran (du "JSX")
function App() {
  return (
    <div style={{ textAlign: "center", padding: "40px", fontFamily: "sans-serif" }}>

      {/* Le titre principal de ton projet */}
      <h1>🔧 CHAUDIERE-WEB3</h1>

      {/* Un sous-titre qui explique ton projet */}
      <p>Registre blockchain pour l'entretien des chaudieres</p>

    </div>
  );
}

// On "exporte" le composant App pour que le reste de l'appli puisse l'afficher
export default App;