import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { createStore } from './store';
import './styles.scss';

const root = document.getElementById('root');
if (!root) throw new Error('Fant ikke appens rot-element.');
createRoot(root).render(<Provider store={createStore()}><App /></Provider>);
