/**
 * App — 路由配置（嵌套路由模式：Layout 渲染 <Outlet/>，页面为其子路由）
 */
import { Routes, Route } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import Hangul from './pages/Hangul';
import Vocabulary from './pages/Vocabulary';
import Pronunciation from './pages/Pronunciation';
import Corpus from './pages/Corpus';
import Review from './pages/Review';
import Profile from './pages/Profile';
import Auth from './pages/Auth';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="hangul" element={<Hangul />} />
        <Route path="vocabulary" element={<Vocabulary />} />
        <Route path="pronunciation" element={<Pronunciation />} />
        <Route path="corpus" element={<Corpus />} />
        <Route path="review" element={<Review />} />
        <Route path="profile" element={<Profile />} />
        <Route path="auth" element={<Auth />} />
      </Route>
    </Routes>
  );
}
