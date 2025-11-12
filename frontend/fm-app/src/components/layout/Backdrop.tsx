import { motion } from "framer-motion";

export default function Backdrop() {
  return (
    <div className="fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(255,115,0,0.10),transparent_60%),radial-gradient(50%_50%_at_10%_90%,rgba(255,255,255,0.05),transparent_60%)]" />
      <motion.div
        className="absolute bottom-8 right-8 pointer-events-none select-none text-[5.5rem] md:text-[7rem] font-semibold tracking-tight"
        initial={{ opacity: 0.04, rotate: 0 }}
        animate={{ opacity: 0.06, rotate: [0, -2, 0, 1, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        style={{ WebkitTextStroke: "1px rgba(255,255,255,0.06)" }}
      >
        Freiraum Beratung
      </motion.div>
    </div>
  );
}


