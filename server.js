const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt")
require("dotenv").config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());





const { PrismaClient } = require("./generated/prisma");
const { withAccelerate } = require("@prisma/extension-accelerate");

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
}).$extends(withAccelerate());


app.get("/api/check-email/:email", async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { email: req.params.email },
      select: { id: true } 
    });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ error: "Erro no banco" });
  }
});

app.post("/api/register", async (req, res) => {
  const { nome, email, senha } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoUsuario = await prisma.usuario.create({
      data: { 
        nome, 
        email, 
        senha: senhaHash,
        tipo: "cliente" 
      },
    });

    res.status(201).json({ success: true, user: novoUsuario });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Erro ao cadastrar. O e-mail pode já existir." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const user = await prisma.usuario.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ field: "email", message: "E-mail não cadastrado." });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(401).json({ field: "password", message: "Senha incorreta." });
    }

    const { senha: _, ...userData } = user;
    res.json(userData);

  } catch (error) {
    res.status(500).json({ field: "server", message: "Erro interno no servidor." });
  }
});


const nodemailer = require("nodemailer");

const codigosVerificacao = {};

app.post("/api/send-code", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "E-mail não cadastrado." });

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    codigosVerificacao[email] = {
      codigo: codigo,
      expira: Date.now() + (10 * 60 * 1000) 
    };

    console.log(`Código para ${email}: ${codigo}`); 
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro no servidor." });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  const dadosRecuperacao = codigosVerificacao[email];

  if (!dadosRecuperacao || dadosRecuperacao.codigo !== code) {
    return res.status(400).json({ error: "Código inválido." });
  }

  if (Date.now() > dadosRecuperacao.expira) {
    delete codigosVerificacao[email]; // Limpa para não ocupar memória
    return res.status(400).json({ error: "Este código expirou (limite de 10 min)." });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(newPassword, salt);

    await prisma.usuario.update({
      where: { email: email },
      data: { senha: senhaHash }
    });

    delete codigosVerificacao[email];

    res.json({ success: true, message: "Senha alterada com sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar a senha no banco." });
  }
});


app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const rootPath = path.join(__dirname, 'index.html');
  const publicPath = path.join(__dirname, 'public', 'index.html');
  
  res.sendFile(rootPath, (err) => {
    if (err) {
      res.sendFile(publicPath, (err2) => {
        if (err2) {
          res.status(404).send("<h1>Erro: Arquivo index.html não encontrado!</h1><p>Verifique se o nome do arquivo está correto.</p>");
        }
      });
    }
  });
});


// 5. LIGAR O SERVIDOR
app.listen(PORT, () => {
  console.log(`\n🚀 SITE ONLINE: http://localhost:${PORT}`);
  console.log(`📂 Pasta: ${__dirname}`);

  // Tenta conectar ao banco em segundo plano
  prisma
    .$connect()
    .then(() => console.log("🐘 Banco de Dados: OK"))
    .catch(() =>
      console.log("⚠️  Aviso: Banco offline, mas o site deve abrir."),
    );
});
