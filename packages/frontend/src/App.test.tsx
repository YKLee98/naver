// packages/frontend/src/App.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';

test('renders ERP System', () => {
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );
  const element = screen.getByText(/ERP System/i);
  expect(element).toBeInTheDocument();
});
