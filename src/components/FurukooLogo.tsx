import { useNavigate } from 'react-router-dom';

export const FurukooLogo: React.FC = () => {
  const navigate = useNavigate();
  return (
    <img
      src="/logo.png"
      alt="Furukoo"
      height={40}
      style={{ height: 40, cursor: 'pointer' }}
      onClick={() => navigate('/')}
    />
  );
};

export default FurukooLogo;
