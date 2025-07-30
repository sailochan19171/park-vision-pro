import Header from "../components/Header";
import Solutions from "../components/Solutions";
import Footer from "../components/Footer";

const SolutionsPage = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-20">
        <Solutions />
      </main>
      <Footer />
    </div>
  );
};

export default SolutionsPage;