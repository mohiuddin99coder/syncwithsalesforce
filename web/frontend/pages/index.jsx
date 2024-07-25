import {
  Page
} from "@shopify/polaris";
import { MyComponent } from "../components/MyComponent";
import './index.css';

export default function HomePage() {
  return (
    <div className="container">
      <div className="topbar-section">
        <div className="logo-block">
          <img className="logo" src="../assets/etglogo.png" alt="logo image" />
          <h1 className='app-name'>Salesforce Connecter</h1>
        </div>
      </div>
      <div className="form-section">
        <div className="form-component">
          <MyComponent />
        </div>
        
      </div>
    </div>
  );
}
