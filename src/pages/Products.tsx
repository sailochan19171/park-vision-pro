import Header from "../components/Header";
import Products from "../components/Products";
import Footer from "../components/Footer";

const ProductsPage = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-20">
        <Products />
      </main>
      <Footer />
    </div>
  );
};

export default ProductsPage;