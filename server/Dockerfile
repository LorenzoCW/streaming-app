# 1. Imagem base oficial do Node.js
FROM node:18-alpine

# 2. Diretório de trabalho dentro do container
WORKDIR /usr/src/app

# 3. Copia package.json e package-lock.json
COPY package*.json ./

# 4. Instala dependências
RUN npm install --only=production

# 5. Copia o restante do código
COPY . .

# 6. Expõe a porta que o app vai rodar
EXPOSE 4000

# 7. Comando para iniciar o servidor
CMD [ "node", "server.js" ]