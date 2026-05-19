FROM node:18

# Instalar Python3, dependências e python3-cryptography via apt
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        build-essential \
        libssl-dev \
        libffi-dev \
        ca-certificates \
        python3-cryptography \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json para instalar dependências de Node durante o build (cache-friendly)
COPY package.json package-lock.json* ./
RUN npm install --production || true

# Copiar restante da aplicação
COPY . ./

EXPOSE 5000

CMD ["npm", "start"]
