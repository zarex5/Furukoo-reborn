import { useNavigate } from 'react-router-dom';

export const FurukooLogo: React.FC<{ height?: number }> = ({ height = 40 }) => {
  const navigate = useNavigate();
  return (
    <img
      src="/logo.png"
      alt="Furukoo"
      style={{ height, cursor: 'pointer' }}
      onClick={() => navigate('/')}
    />
  );
};

export default FurukooLogo;
